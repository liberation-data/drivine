import { CypherReader } from '@/cypher/CypherReader';
import { CypherFloat, Expression } from '@/cypher/ast/Expression';
import { Merge, Return, SetClause, Remove, Delete, Match, With } from '@/cypher/ast/Query';

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
        // Strict openCypher: a parameter is not named with a reserved word.
        expect(() => CypherReader.read('RETURN $skip')).toThrow(/^The statement is not Cypher/);
        expect(returned('RETURN 0xff')).toEqual(literal(255));
        expect(returned('RETURN 0o17')).toEqual(literal(15));
        expect(returned('RETURN 1.5e3')).toEqual(literal(new CypherFloat(1500)));
        expect(returned('RETURN 2.0')).toEqual(literal(new CypherFloat(2)));
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

    it('refuses Cypher the compiler does not take by name, and what is not Cypher with where', () => {
        expect(() => CypherReader.read('CALL db.labels()')).toThrow(
            'A procedure call (CALL) is Cypher, and is not compiled to SQL yet.'
        );
        expect(() => CypherReader.read('MATCH (n RETURN n')).toThrow(
            /^The statement is not Cypher, at line 1, column /
        );
    });
});
