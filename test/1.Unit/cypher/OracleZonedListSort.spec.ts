import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';
import { PostgresCypherCompiler } from '@/cypher/sql/PostgresCypherCompiler';

/** liberation-data/drivine4j#331's list: worked out item by item with temporal arithmetic, by a comprehension. */
const list = "[i IN range(1, 10) | localdatetime('2024-03-15T10:00:00') + duration({minutes: i})]";

/** #331's statement: its list, on each of two rows. */
const repro = `UNWIND [0, 1] AS k WITH k, ${list} AS l`;

/**
 * #331's list in a map, unwound, and taken out by a `WITH` (liberation-data/drivine4j#369): from a map, one the list was
 * put in after it was worked out, a map two levels down, a list of two maps, and after a write.
 */
const unwoundRepros = [
    `UNWIND [0, 1] AS k WITH k, [{l: ${list}}] AS ms UNWIND ms AS t WITH k, t.l AS l RETURN size([x IN l WHERE x IS NOT NULL])`,
    `${repro} UNWIND [{l: l}] AS t WITH k, t.l AS l RETURN size([x IN l WHERE x IS NOT NULL])`,
    `UNWIND [0, 1] AS k WITH k, [{m: {l: ${list}}}] AS ms UNWIND ms AS t WITH k, t.m AS m WITH k, m.l AS l RETURN size([x IN l WHERE x IS NOT NULL])`,
    `UNWIND [0, 1] AS k WITH k, [{l: ${list}}, {l: ${list}}] AS ms UNWIND ms AS t WITH k, t.l AS l RETURN size([x IN l WHERE x IS NOT NULL])`,
    `UNWIND [0, 1] AS k WITH k, [{l: ${list}}] AS ms UNWIND ms AS t CREATE (:CyUnwoundTemporals) WITH k, t.l AS l RETURN size([x IN l WHERE x IS NOT NULL])`
];

/** Statements that collect, once each, lists that hold #331's temporal values two levels down, or in maps: see liberation-data/drivine4j#347. */
const deepRepros = [
    `${repro} RETURN collect(DISTINCT [l, l])`,
    `${repro} RETURN collect(DISTINCT [x IN l | [x]])`,
    `${repro} RETURN collect(DISTINCT [x IN l | [x, null]])`,
    `${repro} WITH k, [l, l] AS ll RETURN collect(DISTINCT ll)`,
    `${repro} RETURN collect(DISTINCT [x IN l | {t: x}])`
];

/**
 * Statements whose lists may hold #331's temporal values: a list of lists of them, an item of which a quantifier or reduce takes,
 * a list worked out item by item with a coalesce or a CASE that is a temporal value or a number, a list a reduce gives of them,
 * and a list of them at a map's key that a temporal value's field is named for.
 */
const mayHoldRepros = [
    `${repro} WITH k, [l, l] AS ll RETURN [k, any(x IN ll WHERE size([y IN x WHERE y IS NOT NULL]) > 9)] ORDER BY k`,
    `${repro} WITH k, [l, l] AS ll RETURN reduce(s = 0, x IN ll | s + size([y IN x WHERE y IS NOT NULL])) / 2`,
    "UNWIND [0, 1] AS k WITH k, [i IN range(1, 10) | coalesce(CASE WHEN k > 5 THEN k END, localdatetime('2024-03-15T10:00:00') + duration({minutes: i}))] AS l " +
        'RETURN size([x IN l WHERE x IS NOT NULL])',
    "UNWIND [0, 1] AS k WITH k, [i IN range(1, 10) | CASE WHEN k > 5 THEN k ELSE localdatetime('2024-03-15T10:00:00') + duration({minutes: i}) END] AS l " +
        'RETURN size([x IN l WHERE x IS NOT NULL])',
    `${repro} WITH k, reduce(acc = [], x IN l | acc + [x]) AS m RETURN size([y IN m WHERE y IS NOT NULL])`,
    `${repro} WITH k, {minute: l} AS m RETURN size([y IN m.minute WHERE y IS NOT NULL])`,
    `${repro} WITH k, [{minute: l}] AS ms RETURN size([y IN ms[0].minute WHERE y IS NOT NULL])`
];

/** #331's list in a map whose keys are taken: Oracle reads them from the map's data guide. */
const keyed = `${repro} WITH k, {l: l} AS m RETURN size(keys(m))`;

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

    it('should read a coalesce of a list of temporal values, and a list that holds them deeper, item by item on Oracle too', () => {
        // coalesce(l, []) is of l's kind (liberation-data/drivine4j#347).
        const coalesced = new OracleCypherCompiler('g').compile(
            `${repro} RETURN k ORDER BY size([x IN coalesce(l, []) WHERE x IS NOT NULL])`
        ).sql;
        expect(coalesced).toContain('PASSING x6_r.n - 1');
        expect(coalesced).not.toContain('JSON_TABLE(w4.c2');
        // A list of lists of lists, or of maps, of temporal values, as collect(DISTINCT …) gathers it.
        for (const deep of deepRepros) {
            const sql = new OracleCypherCompiler('g').compile(deep).sql;
            expect([deep, sql]).toEqual([deep, expect.stringContaining('PASSING e_r.n - 1')]);
            expect([deep, sql]).toEqual([deep, expect.not.stringMatching(/JSON_TABLE\(w\d+\./)]);
        }
        // A list of maps of them unwound, and such a list taken back out of a map.
        for (const unwound of [
            `${repro} UNWIND [x IN l | {t: x}] AS m RETURN count(m.t)`,
            `${repro} WITH k, {l: l} AS m UNWIND m.l AS t RETURN count(t)`
        ]) {
            const sql = new OracleCypherCompiler('g').compile(unwound).sql;
            expect([unwound, sql]).toEqual([unwound, expect.stringMatching(/PASSING u\d+_r\.n - 1/)]);
        }
        // Not a list of lists of lists of other values, a coalesce, a collect, a UNION or a map of them.
        const numbers = 'UNWIND [0, 1] AS k WITH k, [i IN range(1, 10) | i + k] AS l';
        for (const other of [
            `${numbers} RETURN collect(DISTINCT [l, l])`,
            `${numbers} RETURN size([x IN coalesce(l, []) WHERE x > 1])`,
            `${numbers} RETURN size([x IN coalesce(l, [1, 2]) WHERE x > 1])`,
            `${numbers} UNWIND l AS x WITH k, collect(x) AS c RETURN size([y IN c WHERE y > 1])`,
            `${numbers} WITH k, [x IN l | {a: x, b: 'z'}] AS ms RETURN size([m IN ms WHERE m.a > 1])`,
            `${numbers} WITH k, {l: l, n: 1} AS m RETURN size([x IN m.l WHERE x > 1])`,
            'CALL { RETURN [1, 2] AS l UNION RETURN [3, 4] AS l } RETURN size([x IN l WHERE x > 1])'
        ]) {
            const sql = new OracleCypherCompiler('g').compile(other).sql;
            expect([other, sql]).toEqual([other, expect.not.stringContaining('PASSING')]);
        }
    });

    it('should read an item a quantifier takes, a coalesce, CASE or reduce that may hold a temporal value, and a map of them and its keys, item by item on Oracle too', () => {
        for (const cypher of mayHoldRepros) {
            const sql = new OracleCypherCompiler('g').compile(cypher).sql;
            expect([cypher, sql]).toEqual([cypher, expect.stringContaining('PASSING')]);
            expect([cypher, sql]).toEqual([cypher, expect.not.stringMatching(/JSON_TABLE\((w|q)\d+\.(c|item)/)]);
        }
        const keys = new OracleCypherCompiler('g').compile(keyed).sql;
        expect(keys).toContain('PASSING dg_r.n - 1');
        expect(keys).not.toContain('JSON_TABLE((SELECT JSON_DATAGUIDE');
        // Worked out by the lateral view itself: a subquery in its select list is worked out once, for every row
        // (liberation-data/drivine4j#414, here #434).
        expect(keys).toContain('LATERAL (SELECT /*+ NO_MERGE */ JSON_DATAGUIDE(');
        expect(keys).not.toContain('(SELECT JSON_DATAGUIDE');
    });

    it('should read a list of temporal values a WITH takes out of an unwound map item by item on Oracle too', () => {
        // A property of an unwound item held no temporal values deeper, and such a list was read with JSON_TABLE again
        // (liberation-data/drivine4j#369). Zoned values and durations, and a list with nulls among them, as well.
        const others = [
            "datetime('2024-03-15T10:00:00+02:00') + duration({minutes: i})",
            'duration({minutes: i})',
            'CASE i WHEN 1 THEN null ELSE date() END'
        ].map(
            (it) =>
                `UNWIND [0, 1] AS k WITH k, [{l: [i IN range(1, 10) | ${it}]}] AS ms UNWIND ms AS t WITH k, t.l AS l RETURN size([x IN l WHERE x IS NOT NULL])`
        );
        for (const cypher of [...unwoundRepros, ...others]) {
            const sql = new OracleCypherCompiler('g').compile(cypher).sql;
            expect([cypher, sql]).toEqual([cypher, expect.stringMatching(/PASSING x\d+_r\.n - 1/)]);
            expect([cypher, sql]).toEqual([cypher, expect.not.stringMatching(/JSON_TABLE\((w|q|u)\d+\.(c|item)/)]);
        }
        // A list of other values out of an unwound map is still read with JSON_TABLE, and the value is read as
        // liberation-data/drivine4j#344 reads it.
        const numbers = new OracleCypherCompiler('g').compile(
            'UNWIND [0, 1] AS k WITH k, [{l: range(1, 10)}] AS ms UNWIND ms AS t WITH k, t.l AS l RETURN size([x IN l WHERE x > 1])'
        ).sql;
        expect(numbers).not.toContain('PASSING');
        for (const cypher of [unwoundRepros[0], "UNWIND [{a: 'x', l: [date()]}] AS t WITH t.a AS a RETURN a"]) {
            const sql = new OracleCypherCompiler('g').compile(cypher).sql;
            expect([cypher, sql]).toEqual([cypher, expect.stringContaining('JSON(JSON_QUERY(JSON_SERIALIZE(')]);
        }
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

    it('should read a list of maps of temporal values by its places on Oracle wherever the statement passes it on', () => {
        // Each step that passes on what a list holds deeper than its items (liberation-data/drivine4j#347): every JSON_TABLE
        // that reads a list of maps of numbers made so reads the list of maps of temporal values by its places instead, and
        // only the UNWIND's and range's JSON_TABLEs are left.
        const listed = (item: string): string =>
            `UNWIND [0, 1, 2] AS k WITH k, [i IN range(1, k) | {t: ${item}}] AS ms`;
        const where = 'WHERE m.t IS NOT NULL';
        const readers = [
            `RETURN [m IN tail(ms) ${where}]`,
            `RETURN [m IN reverse(ms) ${where}]`,
            `RETURN [m IN ms[1..] ${where}]`,
            `RETURN [m IN ms + ms ${where}]`,
            `RETURN [m IN CASE WHEN k > 0 THEN ms END ${where}]`,
            `WITH k, [ms, ms] AS mss RETURN [m IN head(mss) ${where}]`,
            `WITH k, [ms, ms] AS mss RETURN [m IN last(mss) ${where}]`,
            `WITH k, [ms, ms] AS mss RETURN [m IN mss[1] ${where}]`,
            `WITH min(ms) AS mn RETURN [m IN mn ${where}]`,
            `WITH max(ms) AS mx RETURN [m IN mx ${where}]`,
            'WITH collect(ms) AS c RETURN [x IN c WHERE size(x) > 0]',
            `WITH k, {s: ms} AS z RETURN [m IN z {.s}.s ${where}]`,
            `WITH k, {s: ms} AS z RETURN [m IN z {.*, n: 1}.s ${where}]`,
            `UNWIND [ms] AS u RETURN [m IN u ${where}]`,
            `CALL { WITH ms RETURN [{t: 1}] AS u UNION WITH ms RETURN ms AS u } RETURN [m IN u ${where}]`
        ];
        const count = (sql: string, of: string): number => sql.split(of).length - 1;
        for (const reader of readers) {
            const [temporal, other] = ["localdatetime('2024-03-15T10:00:00') + duration({minutes: i})", 'i + 1'].map(
                (item) => new OracleCypherCompiler('g').compile(`${listed(item)} ${reader}`).sql
            );
            expect([reader, count(temporal, 'JSON_TABLE')]).toEqual([reader, 2]);
            expect([reader, count(temporal, 'PASSING') - count(other, 'PASSING')]).toEqual([
                reader,
                count(other, 'JSON_TABLE') - 2
            ]);
        }
    });
});
