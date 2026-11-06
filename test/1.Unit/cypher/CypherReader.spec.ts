import { CypherReader } from '@/cypher/CypherReader';
import { CypherFloat, Expression, PatternComprehension } from '@/cypher/ast/Expression';
import {
    Call,
    Create,
    Foreach,
    Merge,
    Projection,
    Return,
    SetClause,
    Remove,
    Delete,
    Match,
    Unwind,
    With
} from '@/cypher/ast/Query';

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

    it('reads an empty map of properties in a pattern as none, as every node and relationship meets it', () => {
        // Read as a map, it compiled to no test at all, an empty WHERE or a dangling AND on the SQL stores (#605, drivine4j#583).
        [
            ['MATCH (a {}) RETURN a', 'MATCH (a) RETURN a'],
            ['MATCH (a:X {})-[r:R {}]->(b {}) RETURN r', 'MATCH (a:X)-[r:R]->(b) RETURN r'],
            ['MATCH (a)-[:R*1..2 {}]->(b) RETURN b', 'MATCH (a)-[:R*1..2]->(b) RETURN b'],
            [
                'MATCH (a) WHERE EXISTS { (a)-[:R {}]->({}) } RETURN a',
                'MATCH (a) WHERE EXISTS { (a)-[:R]->() } RETURN a'
            ],
            ['MERGE (a:X {}) CREATE (a)-[:R {}]->(:Y {})', 'MERGE (a:X) CREATE (a)-[:R]->(:Y)']
        ].forEach(([empty, without]) => {
            const read = CypherReader.read(empty);
            expect([empty, read]).toEqual([empty, CypherReader.read(without)]);
            // Keyed alike too, as an order term or a grouping key reads a pattern within an expression by its text.
            expect([empty, JSON.stringify(read)]).toEqual([empty, JSON.stringify(CypherReader.read(without))]);
        });
        // A map with a key, and a parameter's map, are still read as they are.
        const properties = (CypherReader.read('MATCH (a {k: 1}), (b $p) RETURN a').clauses[0] as Match).patterns.map(
            (it) => it.nodes[0].properties
        );
        expect(properties.map((it) => it?.kind)).toEqual(['MapLiteral', 'Parameter']);
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

    it('refuses what is still not Cypher, now a keyword may name a variable, where it stops being Cypher', () => {
        [
            ['MATCH (n RETURN n', 'line 1, column 10'],
            ['RETURN CASE WHEN 1 THEN 2', 'line 1, column 26'],
            ['RETURN CASE WHEN true THEN end', 'line 1, column 31'],
            ['MATCH (n) RETURN n ORDER', 'line 1, column 25'],
            ['MATCH (n)\nWITH n\nRETURN n ORDER BY', 'line 3, column 18']
        ].forEach(([cypher, at]) => {
            expect(() => CypherReader.read(cypher)).toThrow(new RegExp(`^The statement is not Cypher, at ${at}: `));
        });
    });

    it('reads a keyword as a variable as Neo4j takes it, and a CASE still ends at its END', () => {
        // APOC's export names a relationship's nodes start and end (drivine4j#635).
        const [, , end, create] = CypherReader.read(
            'UNWIND [{start: {_id: 1}, end: {_id: 2}}] AS row MATCH (start:L {id: row.start._id}) MATCH (end:L {id: row.end._id}) CREATE (start)-[r:T]->(end)'
        ).clauses as [Unwind, Match, Match, Create];
        expect(end.patterns[0].nodes.map((it) => it.variable)).toEqual(['end']);
        expect(create.patterns[0].nodes.map((it) => it.variable)).toEqual(['start', 'end']);
        expect(returned('WITH 1 AS when, 2 AS end, 3 AS else RETURN CASE WHEN when THEN end ELSE else END')).toEqual({
            kind: 'Case',
            alternatives: [[variable('when'), variable('end')]],
            otherwise: variable('else')
        });
        [
            'match',
            'MATCH',
            'order',
            'return',
            'case',
            'distinct',
            'not',
            'in',
            'is',
            'as',
            'all',
            'call',
            'yield',
            'skip',
            'limit',
            'union',
            'exists'
        ].forEach((word) => {
            expect([word, returned(`UNWIND [1] AS ${word} RETURN ${word}`)]).toEqual([word, variable(word)]);
        });
        expect(returned('UNWIND [1] AS desc RETURN desc ORDER BY desc DESC')).toEqual(variable('desc'));
        // As written, so End is another variable than end, and between backticks the same.
        const first = (cypher: string) => (CypherReader.read(cypher).clauses[0] as Match).patterns[0].nodes[0].variable;
        expect(first('MATCH (End) RETURN end')).toEqual('End');
        expect(first('MATCH (`end`) RETURN end')).toEqual('end');
        // A value stays one.
        expect(returned('RETURN null')).toEqual(literal(null));
        expect(returned('RETURN true')).toEqual(literal(true));
        expect(returned('WITH true AS x RETURN NOT x')).toEqual({
            kind: 'Unary',
            operator: 'NOT',
            operand: variable('x')
        });
    });

    it('reads a keyword as a variable wherever a variable stands', () => {
        const foreach = CypherReader.read('UNWIND [1] AS end FOREACH (end IN [1] | CREATE (:A {v: end}))').clauses[1];
        expect((foreach as Foreach).variable).toEqual('end');
        const call = CypherReader.read('WITH 1 AS end, 2 AS case CALL (end, case) { RETURN end + case AS e } RETURN e')
            .clauses[1] as Call;
        expect(call.imports).toEqual(['end', 'case']);
        const [, set, remove] = CypherReader.read(
            'MATCH (end) SET end.x = 1, end:L, end += {a: 1}, end = {} REMOVE end.x, end:L'
        ).clauses as [Match, SetClause, Remove];
        expect(set.items).toEqual([
            { kind: 'Property', variable: 'end', key: 'x', value: literal(1) },
            { kind: 'Labels', variable: 'end', labels: ['L'] },
            { kind: 'Add', variable: 'end', value: { kind: 'MapLiteral', entries: [['a', literal(1)]] } },
            { kind: 'Replace', variable: 'end', value: { kind: 'MapLiteral', entries: [] } }
        ]);
        expect(remove.items).toEqual([
            { kind: 'Property', variable: 'end', key: 'x' },
            { kind: 'Labels', variable: 'end', labels: ['L'] }
        ]);
        expect(returned('CALL db.labels() YIELD label AS end RETURN end')).toEqual(variable('end'));
        const [path] = (CypherReader.read('MATCH end = (a)-[case]->(b) RETURN end').clauses[0] as Match).patterns;
        expect([path.variable, path.relationships[0].variable]).toEqual(['end', 'case']);
        expect(returned('WITH [1] AS l RETURN [end IN l WHERE end > 0 | end]')).toEqual({
            kind: 'ListComprehension',
            variable: 'end',
            list: variable('l'),
            where: { kind: 'Binary', operator: 'GREATER_THAN', left: variable('end'), right: literal(0) },
            projection: variable('end')
        });
        expect(returned('WITH [true] AS l RETURN all(all IN l WHERE all)')).toEqual({
            kind: 'Quantifier',
            of: 'ALL',
            variable: 'all',
            list: variable('l'),
            where: variable('all')
        });
        expect(returned('WITH [1] AS l RETURN reduce(end = 0, in IN l | end + in)')).toEqual({
            kind: 'Reduce',
            accumulator: 'end',
            initial: literal(0),
            variable: 'in',
            list: variable('l'),
            expression: { kind: 'Binary', operator: 'ADD', left: variable('end'), right: variable('in') }
        });
        expect(returned('MATCH (end) RETURN end {.name}')).toEqual({
            kind: 'MapProjection',
            variable: 'end',
            elements: [{ kind: 'Selected', key: 'name' }]
        });
        expect(returned('MATCH (n), (end) RETURN n {end, case: end}')).toEqual({
            kind: 'MapProjection',
            variable: 'n',
            elements: [
                { kind: 'Variable', name: 'end' },
                { kind: 'Entry', key: 'case', value: variable('end') }
            ]
        });
        const comprehension = returned(
            'MATCH (a) RETURN [order = (a)-[case]->(end) WHERE end.x = 1 | end.name]'
        ) as PatternComprehension;
        expect(comprehension.pattern.variable).toEqual('order');
        expect(comprehension.pattern.nodes.map((it) => it.variable)).toEqual(['a', 'end']);
        expect(comprehension.pattern.relationships.map((it) => it.variable)).toEqual(['case']);
    });

    it('reads a keyword that names a variable beside the same keyword as Neo4j reads it', () => {
        const projection = (cypher: string): Projection => {
            const clauses = CypherReader.read(cypher).clauses;
            return (clauses[clauses.length - 1] as Return).projection;
        };
        expect(projection('UNWIND [1] AS distinct RETURN distinct')).toEqual({
            distinct: false,
            star: false,
            items: [{ expression: variable('distinct'), name: 'distinct' }],
            orderBy: []
        });
        expect(projection('UNWIND [1] AS distinct RETURN DISTINCT distinct')).toEqual({
            distinct: true,
            star: false,
            items: [{ expression: variable('distinct'), name: 'distinct' }],
            orderBy: []
        });
        expect(projection('UNWIND [1] AS desc RETURN desc ORDER BY desc DESC').orderBy).toEqual([
            { expression: variable('desc'), descending: true }
        ]);
        expect(projection('UNWIND [1] AS asc RETURN asc ORDER BY asc').orderBy).toEqual([
            { expression: variable('asc'), descending: false }
        ]);
        const withOrder = CypherReader.read('UNWIND [1] AS order WITH order ORDER BY order RETURN order')
            .clauses[1] as With;
        expect(withOrder.projection.orderBy).toEqual([{ expression: variable('order'), descending: false }]);
        const paged = projection('UNWIND [1] AS skip WITH skip AS limit RETURN limit SKIP 0 LIMIT 1');
        expect([paged.skip, paged.limit]).toEqual([literal(0), literal(1)]);
        // count(distinct) is count() of DISTINCT and nothing, as it was before a keyword could name a variable.
        expect(returned('UNWIND [1] AS x RETURN count(distinct)')).toEqual({
            kind: 'Function',
            name: 'count',
            distinct: true,
            arguments: []
        });
        expect(returned('UNWIND [1] AS distinct RETURN count(DISTINCT distinct)')).toEqual({
            kind: 'Function',
            name: 'count',
            distinct: true,
            arguments: [variable('distinct')]
        });
        const where = CypherReader.read('MATCH (where) WHERE where.x = 1 RETURN where').clauses[0] as Match;
        expect(where.patterns[0].nodes.map((it) => it.variable)).toEqual(['where']);
        expect(where.where).toEqual({
            kind: 'Binary',
            operator: 'EQUALS',
            left: { kind: 'Property', subject: variable('where'), key: 'x' },
            right: literal(1)
        });
        expect(returned('WITH 1 AS end, 0 AS then RETURN CASE end WHEN 1 THEN end ELSE then END')).toEqual({
            kind: 'Case',
            subject: variable('end'),
            alternatives: [[literal(1), variable('end')]],
            otherwise: variable('then')
        });
        const [exists, subquery] = projection(
            'UNWIND [1] AS exists RETURN exists, EXISTS { MATCH (exists) } AS e'
        ).items.map((it) => it.expression);
        expect(exists).toEqual(variable('exists'));
        expect(subquery).toMatchObject({ kind: 'Subquery', of: 'EXISTS' });
        expect(
            projection('UNWIND [[true]] AS all RETURN all, all(x IN all WHERE x) AS a').items.map((it) => it.expression)
        ).toEqual([
            variable('all'),
            { kind: 'Quantifier', of: 'ALL', variable: 'x', list: variable('all'), where: variable('x') }
        ]);
        const union = CypherReader.read(
            'UNWIND [1] AS union RETURN union UNION ALL UNWIND [2] AS all RETURN all AS union UNION RETURN 3 AS union'
        );
        expect(union.unions.map((it) => it.all)).toEqual([true, false]);
        const allPart = union.unions[0].clauses;
        expect((allPart[allPart.length - 1] as Return).projection.items[0].expression).toEqual(variable('all'));
        expect(returned('UNWIND [true] AS not RETURN NOT not')).toEqual({
            kind: 'Unary',
            operator: 'NOT',
            operand: variable('not')
        });
        expect(returned('UNWIND [1] AS is RETURN is IS NOT NULL')).toEqual({
            kind: 'Unary',
            operator: 'IS_NOT_NULL',
            operand: variable('is')
        });
        expect(returned('UNWIND [[1]] AS in RETURN 1 IN in')).toEqual({
            kind: 'Binary',
            operator: 'IN',
            left: literal(1),
            right: variable('in')
        });
        const merge = CypherReader.read('MERGE (on:A) ON CREATE SET on.a = 1 ON MATCH SET on.b = 2')
            .clauses[0] as Merge;
        expect([merge.onCreate, merge.onMatch]).toEqual([
            [{ kind: 'Property', variable: 'on', key: 'a', value: literal(1) }],
            [{ kind: 'Property', variable: 'on', key: 'b', value: literal(2) }]
        ]);
        const clauses = CypherReader.read('MATCH (detach) DETACH DELETE detach').clauses;
        expect(clauses[clauses.length - 1]).toEqual({
            kind: 'Delete',
            detach: true,
            expressions: [variable('detach')]
        });
    });
});
