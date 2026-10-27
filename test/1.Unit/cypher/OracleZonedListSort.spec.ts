import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';
import { PostgresCypherCompiler } from '@/cypher/sql/PostgresCypherCompiler';

/**
 * On Oracle, a list of zoned values sorts, and takes its `min` and `max`, as its JSON, by the text of each item: Oracle
 * takes many minutes to parse the key that sorts it by moments over a list worked out item by item with temporal
 * arithmetic (liberation-data/drivine4j#331). Postgres sorts it by moments (#361): see the Cypher spec suite, and
 * OracleZonedListSort.spec.ts among the integration tests for the statements that stalled Oracle.
 */
describe('A list of zoned values in compiled Cypher', () => {
    const sorted =
        "UNWIND ['2024-03-15T10:00:00+02:00', '2024-03-15T09:00:00Z'] AS at WITH [datetime(at)] AS l RETURN 1 ORDER BY l";
    const extreme =
        "UNWIND ['2024-03-15T10:00:00+02:00', '2024-03-15T09:00:00Z'] AS at WITH [[datetime(at)]] AS l RETURN min(l), max(l)";

    it('should sort and take its min and max on Oracle with no key of their moments, as should a list of lists of them', () => {
        for (const cypher of [sorted, extreme]) {
            const sql = new OracleCypherCompiler('g').compile(cypher).sql;
            expect(sql).not.toContain('LISTAGG');
            expect(sql).not.toContain(' mk1');
        }
    });

    it('should sort and take its min and max on Postgres by their moments, as should a list of lists of them', () => {
        for (const cypher of [sorted, extreme]) {
            const sql = new PostgresCypherCompiler('g').compile(cypher).sql;
            expect(sql).toContain('string_agg');
            expect(sql).toContain(' mk1');
        }
    });
});
