import { CypherReader } from '@/cypher/CypherReader';
import { CypherFloat, Expression } from '@/cypher/ast/Expression';
import { Call, Merge, Return, SetClause, Remove, Delete, Match, Unwind, With } from '@/cypher/ast/Query';

/** The one item a statement's last clause, a `RETURN`, returns. */
function returned(cypher: string): Expression {
    const clauses = CypherReader.read(cypher).clauses;
    return (clauses[clauses.length - 1] as Return).projection.items[0].expression;
}

const variable = (name: string): Expression => ({ kind: 'Variable', name });
const literal = (value: string | number | CypherFloat | boolean | null): Expression => ({ kind: 'Literal', value });

/** A Cypher statement read into the syntax tree the compiler works from: drivine4j's CypherReaderTest. */
describe('CypherReader', () => {
    it('reads the drivine style as a match, a with of a pattern comprehension, and one returned map', () => {
        const [match, withClause, ret] = CypherReader.read(
            [
                'MATCH (actor:Person {name: $name})',
                'WITH actor, [(actor)-[:ACTED_IN]-(movie:Movie) | movie {.title, .released}] AS movies',
                'RETURN { actor: actor, movies: movies }'
            ].join('\n')
        ).clauses;
        expect((match as Match).patterns[0].nodes[0]).toEqual({
            variable: 'actor',
            labels: ['Person'],
            properties: { kind: 'MapLiteral', entries: [['name', { kind: 'Parameter', name: 'name' }]] }
        });
        const movies = (withClause as With).projection.items[1];
        expect(movies.name).toEqual('movies');
        expect(movies.expression).toMatchObject({
            kind: 'PatternComprehension',
            pattern: {
                nodes: [
                    { variable: 'actor', labels: [] },
                    { variable: 'movie', labels: ['Movie'] }
                ],
                relationships: [{ types: ['ACTED_IN'], direction: 'EITHER' }]
            },
            projection: {
                kind: 'MapProjection',
                variable: 'movie',
                elements: [
                    { kind: 'Selected', key: 'title' },
                    { kind: 'Selected', key: 'released' }
                ]
            }
        });
        expect((ret as Return).projection.items[0].expression).toEqual({
            kind: 'MapLiteral',
            entries: [
                ['actor', variable('actor')],
                ['movies', variable('movies')]
            ]
        });
    });

    it('reads a relationship with its direction, alternatives and range', () => {
        const match = CypherReader.read('MATCH (a)<-[r:KNOWS|LIKES*1..3]-(b)-[*2]->(c)-[*..4]-(d)-[*]-(e) RETURN a')
            .clauses[0] as Match;
        const [first, second, third, fourth] = match.patterns[0].relationships;
        expect(first).toMatchObject({
            variable: 'r',
            types: ['KNOWS', 'LIKES'],
            direction: 'INCOMING',
            range: { min: 1, max: 3 }
        });
        expect(second.range).toEqual({ min: 2, max: 2 });
        expect(second.direction).toEqual('OUTGOING');
        expect(third.range).toMatchObject({ max: 4 });
        expect(third.range?.min).toBeUndefined();
        expect(fourth.range).toBeDefined();
        expect(fourth.range?.min).toBeUndefined();
        expect(fourth.range?.max).toBeUndefined();
    });

    it('reads a quantified relationship as a range, either bound of its braces left out', () => {
        const ranges = (cypher: string): unknown[] =>
            (CypherReader.read(cypher).clauses[0] as Match).patterns[0].relationships.map((it) => it.range);
        expect(ranges('MATCH (a)-[:R]->{2}(b)-[:R]->{1,3}(c)-[:R]->{,4}(d)-[:R]->{2,}(e) RETURN a')).toEqual([
            { min: 2, max: 2 },
            { min: 1, max: 3 },
            { min: 0, max: 4 },
            { min: 2 }
        ]);
        expect(ranges('MATCH (a)-[:R]->+(b)-[:R]->*(c) RETURN a')).toEqual([{ min: 1 }, { min: 0 }]);
    });

    it('reads a quantified path pattern as a relationship of its group, and a pattern in parentheses with no quantifier as the pattern', () => {
        const match = CypherReader.read('MATCH (a) ((x:P)-[r:R]->(y) WHERE x.v < y.v){1,3} (b) RETURN a')
            .clauses[0] as Match;
        const where: Expression = {
            kind: 'Binary',
            operator: 'LESS_THAN',
            left: { kind: 'Property', subject: variable('x'), key: 'v' },
            right: { kind: 'Property', subject: variable('y'), key: 'v' }
        };
        const group = {
            pattern: {
                nodes: [
                    { variable: 'x', labels: ['P'] },
                    { variable: 'y', labels: [] }
                ],
                relationships: [{ variable: 'r', types: ['R'], direction: 'OUTGOING' }]
            },
            where
        };
        expect(match.patterns).toEqual([
            {
                nodes: [
                    { variable: 'a', labels: [] },
                    { variable: 'b', labels: [] }
                ],
                relationships: [{ types: [], direction: 'OUTGOING', range: { min: 1, max: 3 }, group }]
            }
        ]);
        const patterns = (cypher: string) => (CypherReader.read(cypher).clauses[0] as Match).patterns;
        expect(patterns('MATCH ((a)-[:R]->(b)) RETURN a')).toEqual(patterns('MATCH (a)-[:R]->(b) RETURN a'));
        const [shortest] = patterns('MATCH p = shortestPath((a)-[:R*]->(b)) RETURN p');
        expect(shortest.shortest).toEqual('ONE');
        expect(shortest.relationships).toEqual([{ types: ['R'], direction: 'OUTGOING', range: {} }]);
    });

    it('joins a quantified path pattern with no node beside it to a node of no label of its own', () => {
        // Opening the path, between two quantified path patterns, and closing it.
        const [path] = (CypherReader.read('MATCH ((x)-[:R]->(y))+ ((p)-[:S]->(q)){2} RETURN x').clauses[0] as Match)
            .patterns;
        expect(path.nodes).toEqual([{ labels: [] }, { labels: [] }, { labels: [] }]);
        expect(path.relationships.map((it) => [it.group?.pattern.nodes.map((n) => n.variable), it.range])).toEqual([
            [['x', 'y'], { min: 1 }],
            [['p', 'q'], { min: 2, max: 2 }]
        ]);
    });

    it('reads a chain of comparisons as their conjunction, with the grammar’s precedence', () => {
        expect(returned('RETURN 1 < x <= 5')).toEqual({
            kind: 'Binary',
            operator: 'AND',
            left: { kind: 'Binary', operator: 'LESS_THAN', left: literal(1), right: variable('x') },
            right: { kind: 'Binary', operator: 'LESS_THAN_OR_EQUAL', left: variable('x'), right: literal(5) }
        });
        expect(returned('RETURN 1 + 2 * 3')).toEqual({
            kind: 'Binary',
            operator: 'ADD',
            left: literal(1),
            right: { kind: 'Binary', operator: 'MULTIPLY', left: literal(2), right: literal(3) }
        });
    });

    it('reads strings, names in backticks, parameters and numbers as their values', () => {
        expect(returned(`RETURN 'it\\'s "quoted"\\n'`)).toEqual(literal('it\'s "quoted"\n'));
        expect(returned("RETURN '\\u00e9\\f'")).toEqual(literal('\u00e9\f'));
        expect(returned('RETURN `my var`.`odd``key`')).toEqual({
            kind: 'Property',
            subject: variable('my var'),
            key: 'odd`key'
        });
        expect(returned('RETURN $1')).toEqual({ kind: 'Parameter', name: '1' });
        // As in Neo4j, and not strict openCypher: a parameter may be named with a reserved word.
        expect(returned('RETURN $skip')).toEqual({ kind: 'Parameter', name: 'skip' });
        expect(returned('RETURN 0xff')).toEqual(literal(255));
        expect(returned('RETURN 0o17')).toEqual(literal(15));
        expect(returned('RETURN 1.5e3')).toEqual(literal(new CypherFloat(1500)));
        expect(returned('RETURN 2.0')).toEqual(literal(new CypherFloat(2)));
        // The least whole number is its digits negated, which alone are past the greatest.
        expect(returned('RETURN -9223372036854775808')).toEqual(literal(-(2 ** 63)));
        expect(returned('RETURN -0x8000000000000000')).toEqual(literal(-(2 ** 63)));
        expect(returned('RETURN -0o1000000000000000000000')).toEqual(literal(-(2 ** 63)));
        // With a space after its minus, as the spec writes it in a step this runner skips.
        expect(returned('RETURN - 9223372036854775808')).toEqual(literal(-(2 ** 63)));
        expect(() => CypherReader.read('RETURN -0x8000000000000001')).toThrow(
            '-0x8000000000000001 is past the range of a whole number, from -9223372036854775808 to 9223372036854775807.'
        );
        expect(returned('RETURN -1')).toEqual({ kind: 'Unary', operator: 'NEGATE', operand: literal(1) });
        expect(() => CypherReader.read('RETURN 9223372036854775808')).toThrow(
            '9223372036854775808 is past the range of a whole number, from -9223372036854775808 to 9223372036854775807.'
        );
        expect(() => CypherReader.read('RETURN -9223372036854775809')).toThrow(
            '-9223372036854775809 is past the range of a whole number, from -9223372036854775808 to 9223372036854775807.'
        );
    });

    it('reads a reading clause straight after a write in the order written', () => {
        const kinds = (cypher: string): string[] => CypherReader.read(cypher).clauses.map((it) => it.kind);
        expect(kinds('CREATE (n:Thing) UNWIND [1, 2] AS x MATCH (m:Thing) RETURN count(m)')).toEqual([
            'Create',
            'Unwind',
            'Match',
            'Return'
        ]);
        expect(kinds('MATCH (n) SET n.a = 1 MATCH (m) DELETE m')).toEqual(['Match', 'Set', 'Match', 'Delete']);
        // And in a part that ends in a WITH.
        expect(kinds('CREATE (n:Thing) MATCH (m:Thing) WITH count(m) AS c RETURN c')).toEqual([
            'Create',
            'Match',
            'With',
            'Return'
        ]);
        // As in Neo4j, a query that returns nothing ends in a write.
        expect(() => CypherReader.read('CREATE (n) MATCH (m)')).toThrow(/is not Cypher/);
    });

    it('reads string, list and null predicates, labels, slices and functions', () => {
        expect(returned('RETURN n.name STARTS WITH $p')).toEqual({
            kind: 'Binary',
            operator: 'STARTS_WITH',
            left: { kind: 'Property', subject: variable('n'), key: 'name' },
            right: { kind: 'Parameter', name: 'p' }
        });
        expect(returned('RETURN n.x IS NOT NULL')).toEqual({
            kind: 'Unary',
            operator: 'IS_NOT_NULL',
            operand: { kind: 'Property', subject: variable('n'), key: 'x' }
        });
        expect(returned('RETURN n:A:B')).toEqual({ kind: 'HasLabels', subject: variable('n'), labels: ['A', 'B'] });
        expect(returned('RETURN xs[..2]')).toMatchObject({ kind: 'Slice', subject: variable('xs'), to: literal(2) });
        expect(returned("RETURN apoc.text.join(xs, ',')")).toEqual({
            kind: 'Function',
            name: 'apoc.text.join',
            distinct: false,
            arguments: [variable('xs'), literal(',')]
        });
        expect(returned('RETURN count(DISTINCT n)')).toEqual({
            kind: 'Function',
            name: 'count',
            distinct: true,
            arguments: [variable('n')]
        });
        expect(returned('RETURN count(*)')).toEqual({ kind: 'CountStar' });
    });

    it('reads a projection with its names, distinct, order, skip and limit', () => {
        const clauses = CypherReader.read(
            'MATCH (n) RETURN DISTINCT n.name AS name, n.age ORDER BY name DESC, n.age SKIP 2 LIMIT $n'
        ).clauses;
        const ret = (clauses[clauses.length - 1] as Return).projection;
        expect(ret.distinct).toBe(true);
        expect(ret.items.map((it) => it.name)).toEqual(['name', 'n.age']);
        expect(ret.orderBy.map((it) => it.descending)).toEqual([true, false]);
        expect(ret.skip).toEqual(literal(2));
        expect(ret.limit).toEqual({ kind: 'Parameter', name: 'n' });
        // As Neo4j names them (#494): an unnamed map projection after its variable, an alias before it, any other item as written.
        const maps = CypherReader.read('MATCH (p) RETURN p {.name}, p {.name, .age} AS q, p {.name}.name').clauses;
        expect((maps[maps.length - 1] as Return).projection.items.map((it) => it.name)).toEqual([
            'p',
            'q',
            'p {.name}.name'
        ]);
    });

    it('reads the writes as their clauses, in order, with or without a return', () => {
        const [, create, merge, set, remove, , del] = CypherReader.read(
            [
                'MATCH (a:Person {id: $id})',
                "CREATE (a)-[:WROTE]->(p:Paper {title: 'x'})",
                "MERGE (t:Topic {name: 'y'}) ON CREATE SET t.made = true ON MATCH SET t += $seen",
                'SET p = $props, p:Draft, a.count = a.count + 1',
                'REMOVE p:Draft, p.title',
                'WITH a, t',
                'DETACH DELETE t'
            ].join('\n')
        ).clauses;
        expect(create).toMatchObject({
            kind: 'Create',
            patterns: [
                {
                    nodes: [
                        { variable: 'a', labels: [] },
                        {
                            variable: 'p',
                            labels: ['Paper'],
                            properties: { kind: 'MapLiteral', entries: [['title', literal('x')]] }
                        }
                    ],
                    relationships: [{ types: ['WROTE'], direction: 'OUTGOING' }]
                }
            ]
        });
        expect((merge as Merge).onCreate).toEqual([
            { kind: 'Property', variable: 't', key: 'made', value: literal(true) }
        ]);
        expect((merge as Merge).onMatch).toEqual([
            { kind: 'Add', variable: 't', value: { kind: 'Parameter', name: 'seen' } }
        ]);
        expect((set as SetClause).items).toEqual([
            { kind: 'Replace', variable: 'p', value: { kind: 'Parameter', name: 'props' } },
            { kind: 'Labels', variable: 'p', labels: ['Draft'] },
            {
                kind: 'Property',
                variable: 'a',
                key: 'count',
                value: {
                    kind: 'Binary',
                    operator: 'ADD',
                    left: { kind: 'Property', subject: variable('a'), key: 'count' },
                    right: literal(1)
                }
            }
        ]);
        expect((remove as Remove).items).toEqual([
            { kind: 'Labels', variable: 'p', labels: ['Draft'] },
            { kind: 'Property', variable: 'p', key: 'title' }
        ]);
        expect(del as Delete).toEqual({ kind: 'Delete', detach: true, expressions: [variable('t')] });
        expect(() => CypherReader.read('MATCH (n) SET n.a.b = 1')).toThrow(
            'A write to a property of anything but a variable is Cypher, and is not compiled to SQL yet.'
        );
    });

    it('reads a union as each query, and whether it keeps every row', () => {
        const query = CypherReader.read('RETURN 1 AS v UNION ALL RETURN 2 AS v UNION ALL RETURN 3 AS v');
        expect(query.unions.map((it) => it.all)).toEqual([true, true]);
        const last = query.unions[query.unions.length - 1].clauses[0] as Return;
        expect(last.projection.items[0].expression).toEqual(literal(3));
    });

    it.each(['foreach', 'shortestPath', 'allShortestPaths', 'transactions', 'rows', 'row'])(
        'reads %s, a word the grammar adds, as a name of a variable, a property or a key',
        (word) => {
            expect(returned(`WITH 1 AS ${word} RETURN ${word}`)).toEqual(variable(word));
            expect(returned(`RETURN n.${word}`)).toEqual({ kind: 'Property', subject: variable('n'), key: word });
            expect(returned(`RETURN {${word}: 1}`)).toEqual({ kind: 'MapLiteral', entries: [[word, literal(1)]] });
        }
    );

    it.each(['limit', 'skip', 'order', 'match', 'count', 'end', 'call', 'yield', 'Return', 'null', 'foreach'])(
        'reads a parameter named by any word, %s among them, in a page, a condition, a map, an unwind and a set',
        (word) => {
            const parameter: Expression = { kind: 'Parameter', name: word };
            expect(returned(`RETURN $${word}`)).toEqual(parameter);
            const [match, unwind, ret] = CypherReader.read(
                `MATCH (n {k: $${word}}) WHERE n.x = $${word} UNWIND $${word} AS i RETURN i SKIP $${word} LIMIT $${word}`
            ).clauses as [Match, Unwind, Return];
            expect(match.patterns[0].nodes[0].properties).toEqual({ kind: 'MapLiteral', entries: [['k', parameter]] });
            expect(match.where).toMatchObject({ right: parameter });
            expect(unwind.list).toEqual(parameter);
            expect([ret.projection.skip, ret.projection.limit]).toEqual([parameter, parameter]);
            const set = CypherReader.read(`MATCH (n) SET n.x = $${word}, n += $${word}`).clauses[1] as SetClause;
            expect(set.items).toEqual([
                { kind: 'Property', variable: 'n', key: 'x', value: parameter },
                { kind: 'Add', variable: 'n', value: parameter }
            ]);
        }
    );

    it('reads a call of db.labels() or db.relationshipTypes() as the query that gives its rows', () => {
        const labels = CypherReader.read('CALL db.labels()');
        expect((labels.clauses[1] as Unwind).list).toEqual({
            kind: 'Function',
            name: 'labels',
            distinct: false,
            arguments: [{ kind: 'Variable', name: '#procedure' }]
        });
        const projection = (labels.clauses[labels.clauses.length - 1] as Return).projection;
        expect(projection.distinct).toBe(true);
        expect(projection.items.map((it) => it.name)).toEqual(['label']);
        // Within a query, a CALL { … } of its own, its WHERE a WITH's in it, and what it yields named as the YIELD names it.
        const call = CypherReader.read(
            'MATCH (m) CALL db.relationshipTypes() YIELD relationshipType AS t WHERE t <> m.x RETURN t'
        ).clauses[1] as Call;
        const [, withClause, ret] = call.query.clauses as [Match, With, Return];
        expect(withClause.projection.items.map((it) => [it.expression, it.name])).toEqual([
            [
                {
                    kind: 'Function',
                    name: 'type',
                    distinct: false,
                    arguments: [{ kind: 'Variable', name: '#procedure' }]
                },
                't'
            ]
        ]);
        expect(withClause.where).toMatchObject({ left: { kind: 'Variable', name: 't' } });
        expect(ret.projection.items.map((it) => it.name)).toEqual(['t']);
    });

    it('reads a call of a subquery with the variables its brackets import', () => {
        // Each form: whether it is OPTIONAL, the variables its brackets name (none with no brackets), and whether it imports each, (*).
        (
            [
                ['MATCH (a) CALL { WITH a RETURN a AS x } RETURN x', [false, undefined, undefined]],
                ['MATCH (a) CALL () { RETURN 1 AS x } RETURN x', [false, [], undefined]],
                ['MATCH (a), (b) CALL (a, b) { RETURN a AS x } RETURN x', [false, ['a', 'b'], undefined]],
                ['MATCH (a), (b) CALL(a,b){ RETURN a AS x } RETURN x', [false, ['a', 'b'], undefined]],
                ['MATCH (a) CALL (*) { RETURN a AS x } RETURN x', [false, [], true]],
                ['MATCH (a) OPTIONAL CALL (a) { MATCH (a)-->(b) RETURN b } RETURN b', [true, ['a'], undefined]]
            ] as const
        ).forEach(([cypher, expected]) => {
            const call = CypherReader.read(cypher).clauses.find((it): it is Call => it.kind === 'Call')!;
            expect([cypher, call.optional, call.imports, call.importsAll]).toEqual([cypher, ...expected]);
        });
    });

    it('refuses Cypher the compiler does not take by name, and what is not Cypher with where', () => {
        expect(() => CypherReader.read('CALL db.indexes()')).toThrow(
            'A procedure call (CALL) is Cypher, and is not compiled to SQL yet.'
        );
        expect(() => CypherReader.read('MATCH (n) CALL db.indexes() YIELD index RETURN index')).toThrow(
            'A procedure call (CALL) is Cypher, and is not compiled to SQL yet.'
        );
        expect(() => CypherReader.read('MATCH (n RETURN n')).toThrow(
            /^The statement is not Cypher, at line 1, column /
        );
    });
});
