import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';

/**
 * A walk compiled for Oracle keeps one plan for its recursive step: Oracle adapted it as the statement ran, and a walk
 * either way around a cycle then found no rows in the next session to run it (liberation-data/drivine4j#182).
 */
describe('A walk compiled for Oracle', () => {
    it.each([
        ['outgoing', "MATCH (:A {id: 'a'})-[:R*]->(n) RETURN n.id"],
        ['incoming', "MATCH (:A {id: 'a'})<-[:R*]-(n) RETURN n.id"],
        ['either way', "MATCH (:A {id: 'a'})-[:R*]-(n) RETURN n.id"],
        ['from its far node', "MATCH (n)-[:R*]->(:A {id: 'a'}) RETURN n.id"],
        ['of a quantified path pattern', "MATCH (:A {id: 'a'}) ((x)-[:R]->(y))+ (n) RETURN n.id"],
        [
            'of a quantified path pattern of two relationships either way',
            "MATCH (:A {id: 'a'}) ((x)-[:R]-(m)-[:R]-(y) WHERE m.v > 0)+ (n) RETURN n.id"
        ]
    ])('takes no adaptive plan for its step, %s', (_, cypher) => {
        const sql = new OracleCypherCompiler('g').compile(cypher).sql;
        expect(sql).toMatch(/UNION ALL\s+SELECT \/\*\+ NO_ADAPTIVE_PLAN \*\/ /);
    });
});

/**
 * A term a projection beside a variable-length walk sorts by, which is none of its items, is bound in no subquery: one
 * so bound, carried out of a WITH's query, closed Oracle's (23.26) session (liberation-data/drivine#252). Elsewhere it
 * is, so the statement grows with the operations nested in it, not exponentially.
 */
describe('A term sorted by beside a walk, compiled for Oracle', () => {
    const sorted = 'WITH b ORDER BY toString(coalesce(b.name, b.title)) RETURN coalesce(b.name, b.title)';
    const bound = /\bsh\d+\b/;

    it.each([
        ['of a variable-length walk', "MATCH (:Person {name: 'Laurence'})-[*]->(b) "],
        ['of a quantified path pattern', "MATCH (:Person {name: 'Laurence'}) ((x)-[:KNOWS]->(y))+ (b) "],
        ['of a walk a WITH before it reads', "MATCH (:Person {name: 'Laurence'})-[*]->(b) WITH b "]
    ])('is bound in no subquery, %s', (_, walk) => {
        expect(new OracleCypherCompiler('g').compile(walk + sorted).sql).not.toMatch(bound);
    });

    it('is bound in a subquery with no walk', () => {
        const sql = new OracleCypherCompiler('g').compile(
            `MATCH (:Person {name: 'Laurence'})-->(b) WITH b ${sorted}`
        ).sql;
        expect(sql).toMatch(bound);
    });
});
