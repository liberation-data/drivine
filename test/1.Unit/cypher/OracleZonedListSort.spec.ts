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

    it('should read a list of temporal values by its places on Oracle wherever it is read, in each shape of IN too', () => {
        // Each reader of the list `l`, which may hold a null: every JSON_TABLE that reads a list of numbers made so reads
        // the list of temporal values by its places instead, and only the UNWIND's and range's JSON_TABLEs are left.
        const listed = (item: string): string =>
            `UNWIND [0, 1, 2] AS k WITH k, [i IN range(1, k) | CASE WHEN i > 1 THEN ${item} END] AS l, $v AS v`;
        const readers = [
            'RETURN v IN l',
            'WITH k, l, v WHERE v IN l RETURN k',
            'WITH k, l WHERE $v IN l RETURN k',
            'WITH k, l WHERE l[0] IN l RETURN k',
            'RETURN l[0] IN l',
            'RETURN [x IN l WHERE x IN l]',
            'RETURN l[1..]',
            'RETURN reverse(l)',
            'RETURN tail(l)',
            'UNWIND l AS t RETURN t',
            'RETURN any(x IN l WHERE x IS NULL)',
            'RETURN all(x IN l WHERE x IS NULL)',
            'RETURN none(x IN l WHERE x IS NULL)',
            'RETURN single(x IN l WHERE x IS NULL)',
            'RETURN [x IN l | x]',
            'RETURN collect(DISTINCT l)',
            'UNWIND l AS t RETURN collect(DISTINCT t)'
        ];
        const count = (sql: string, of: string): number => sql.split(of).length - 1;
        for (const reader of readers) {
            const [temporal, other] = ["localdatetime('2024-03-15T10:00:00') + duration({minutes: i})", 'i + 1'].map(
                (item) => new OracleCypherCompiler('g').compile(`${listed(item)} ${reader}`, { v: 1 }).sql
            );
            expect([reader, count(temporal, 'JSON_TABLE')]).toEqual([reader, 2]);
            expect([reader, count(temporal, 'PASSING') - count(other, 'PASSING')]).toEqual([
                reader,
                count(other, 'JSON_TABLE') - 2
            ]);
        }
    });
});
