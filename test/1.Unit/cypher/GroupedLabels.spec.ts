import { holdsLabel } from '@/backend/oracle/OracleGraph';
import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';
import { PostgresCypherCompiler } from '@/cypher/sql/PostgresCypherCompiler';

/**
 * On Oracle, a node a `MATCH` finds after a `WITH` that groups its rows is tested for its labels by their text, which
 * the index over labels can't answer ({@link OracleCypherCompiler.groupedLabels}): answered by that index, Oracle
 * sometimes crashed the session building the cursor of the Cypher spec's "Maps and lists holding relationships compare
 * by identity" (ORA-00600 `[QJSNMV_GET_MVI_MD:2]`, #620, liberation-data/drivine4j#320). Every other test of a node's
 * labels is as it was, so the index still finds the nodes of a label. The spec case pins the rows.
 */
describe('A node a MATCH finds after a WITH that groups, compiled', () => {
    const oracle = (cypher: string): string => new OracleCypherCompiler('g').compile(cypher).sql;
    const indexed = (alias: string, label: string): string => `JSON_EXISTS(${alias}.labels, '$[*]?(@ == "${label}")')`;
    /** The aliases of the nodes `sql` tests for `label` in the index's form, and those it tests by the labels' text. */
    const tests = (sql: string, label: string): [string[], string[]] => [
        [
            ...sql.matchAll(
                new RegExp(`JSON_EXISTS\\((n\\d+)\\.labels, '\\$\\[\\*\\]\\?\\(@ == "${label}"\\)'\\)`, 'g')
            )
        ].map((it) => it[1]),
        [...new Set([...sql.matchAll(/JSON_SERIALIZE\((n\d+)\.labels\)/g)].map((it) => it[1]))].filter((it) =>
            sql.includes(holdsLabel(`${it}.labels`, label))
        )
    ];

    it('tests the labels of the later node by their text, and the grouped node through the index, in the spec case that crashed', () => {
        const sql = oracle(
            "MATCH (p:Person)-[r:ACTED_IN]->() WITH p, collect(DISTINCT [r]) AS l, count(DISTINCT [r]) AS n MATCH (p)-[r2:ACTED_IN]->(:Movie {title: 'The Matrix'}) RETURN p.name, size(l), n, [r2] IN l ORDER BY p.name"
        );
        expect(sql).toContain(indexed('n1', 'Person'));
        expect(sql).toContain(holdsLabel('n13.labels', 'Movie'));
        expect(tests(sql, 'Movie')).toEqual([[], ['n13']]);
        expect(tests(sql, 'Person')).toEqual([['n1'], []]);
    });

    it('tests by their text after a WITH that aggregates, is DISTINCT, or reads one that does, each label of the node', () => {
        [
            'MATCH (p:Person) WITH count(p) AS c MATCH (m:Movie) RETURN c, m.title',
            'MATCH (p:Person) WITH DISTINCT p.name AS name MATCH (m:Movie) RETURN name, m.title',
            'MATCH (p:Person) WITH p, count(*) AS c WITH p, c MATCH (p)-[:ACTED_IN]->(m:Movie) RETURN m.title',
            'MATCH (p:Person) WITH p, count(*) AS c MATCH (p)-[:ACTED_IN]->(m:Movie:Film) RETURN m.title'
        ].forEach((cypher) => {
            const sql = oracle(cypher);
            const [index, text] = tests(sql, 'Movie');
            expect([cypher, index, text.length]).toEqual([cypher, [], 1]);
            if (cypher.includes(':Film')) {
                expect([cypher, tests(sql, 'Film')[1].length]).toEqual([cypher, 1]);
            }
        });
    });

    it('tests through the index where no WITH groups, or before the WITH that does', () => {
        [
            'MATCH (n:Movie) RETURN count(n)',
            'MATCH (p:Person) WITH p MATCH (p)-[:ACTED_IN]->(m:Movie) RETURN m.title',
            'MATCH (p:Person)-[:ACTED_IN]->(m:Movie) WITH m, count(p) AS c RETURN m.title, c'
        ].forEach((cypher) => {
            const sql = oracle(cypher);
            expect([cypher, tests(sql, 'Movie')]).toEqual([cypher, [[expect.any(String)], []]]);
        });
    });

    it('leaves the test as it was on Postgres', () => {
        const sql = new PostgresCypherCompiler('g').compile(
            'MATCH (p:Person) WITH p, count(*) AS c MATCH (p)-[:ACTED_IN]->(m:Movie) RETURN m.title'
        ).sql;
        expect(sql).toMatch(/n\d+\.labels @> '\["Movie"\]'/);
    });
});
