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
