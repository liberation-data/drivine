import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';
import { PostgresCypherCompiler } from '@/cypher/sql/PostgresCypherCompiler';

/** liberation-data/drivine4j#331's statement: a list worked out item by item with temporal arithmetic, by a comprehension. */
const repro =
    "UNWIND [0, 1] AS k WITH k, [i IN range(1, 10) | localdatetime('2024-03-15T10:00:00') + duration({minutes: i})] AS l";

/**
 * Every store sorts a list of zoned values, and a list of lists of them, and takes its `min` and `max`, by their moments:
 * see the cross-engine Cypher tests. Oracle reads the items of a list of temporal values without `JSON_TABLE`, whose parse
 * of one worked out with temporal arithmetic stalled the session (liberation-data/drivine4j#331): see
 * OracleZonedListSort.spec.ts among the integration tests for the statements that stalled Oracle.
 */
describe('A list of zoned values in compiled Cypher', () => {
    const sorted =
        "UNWIND ['2024-03-15T10:00:00+02:00', '2024-03-15T09:00:00Z'] AS at WITH [datetime(at)] AS l RETURN 1 ORDER BY l";
    const extreme =
        "UNWIND ['2024-03-15T10:00:00+02:00', '2024-03-15T09:00:00Z'] AS at WITH [[datetime(at)]] AS l RETURN min(l), max(l)";

    it('should sort and take its min and max by their moments on every store, as should a list of lists of them', () => {
        for (const cypher of [sorted, extreme]) {
            const oracle = new OracleCypherCompiler('g').compile(cypher).sql;
            expect(oracle).toContain('LISTAGG');
            expect(oracle).toContain(' mk1');
            const postgres = new PostgresCypherCompiler('g').compile(cypher).sql;
            expect(postgres).toContain('string_agg');
            expect(postgres).toContain(' mk1');
        }
    });

    it('should read a list of temporal values item by item on Oracle with no JSON_TABLE, and a list of others with one', () => {
        const temporal = new OracleCypherCompiler('g').compile(
            `${repro} RETURN k ORDER BY size([x IN l WHERE x IS NOT NULL])`
        ).sql;
        expect(temporal).toContain('PASSING x6_r.n - 1');
        expect(temporal).not.toContain('JSON_TABLE(w4.c2');
        const other = new OracleCypherCompiler('g').compile(
            'UNWIND [0, 1] AS k WITH k, [i IN range(1, 10) | i + k] AS l RETURN size([x IN l WHERE x > 1])'
        ).sql;
        expect(other).not.toContain('PASSING');
        // collect(DISTINCT …) keeps each list, or each value, once, reading the collected list by its places too.
        for (const distinct of [
            `${repro} RETURN collect(DISTINCT l)`,
            `${repro} UNWIND l AS t RETURN collect(DISTINCT t)`
        ]) {
            expect(new OracleCypherCompiler('g').compile(distinct).sql).toContain('PASSING e_r.n - 1');
        }
        expect(
            new OracleCypherCompiler('g').compile('UNWIND [1, 1] AS k RETURN collect(DISTINCT k)').sql
        ).not.toContain('PASSING');
    });
});
