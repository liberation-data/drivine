import * as fs from 'fs';
import * as path from 'path';
import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';

/** The SQL of `cypher` compiled for the graph `g` whose store keeps the era functions, and whether it calls them. */
function stored(cypher: string): [string, boolean] {
    const compiler = new OracleCypherCompiler('g');
    return [compiler.compile(cypher).sql, compiler.callsStoredEra];
}

/** The same, compiled for a store without them. */
function inline(cypher: string): [string, boolean] {
    const compiler = new OracleCypherCompiler('g', true, false);
    return [compiler.compile(cypher).sql, compiler.callsStoredEra];
}

/**
 * On Oracle a text or a timestamp whose year may be BC is renumbered by the functions the store keeps beside the graph's
 * tables (see `OracleGraph.era`), each operand written once: the test and the regular expression they stand for wrote it
 * three or four times, and Oracle took up to a minute to plan a statement of temporal arithmetic in a subquery
 * (liberation-data/drivine#572). A store without them has each statement compiled as before. drivine4j's
 * OracleEraFunctionTest (liberation-data/drivine#609).
 */
describe('A year that may be BC on Oracle', () => {
    it("is read and written by the store's functions, with no test of its own", () => {
        const [sql, calls] = stored("RETURN toString(date('-0044-03-15') + duration('P1D'))");
        expect(calls).toBe(true);
        expect(sql).toContain('TO_TIMESTAMP(g_era(');
        expect(sql).toContain('g_era_date(LTRIM(TO_CHAR(');
        for (const inlined of ['ASCII(', "TIMESTAMP '0001-01-01 00:00:00'", "'^-?[0-9]{4}'", 'REGEXP_REPLACE(LTRIM(']) {
            expect(sql).not.toContain(inlined);
        }
    });

    it('is renumbered inline on a store without the functions, as before', () => {
        const [sql, calls] = inline("RETURN toString(date('-0044-03-15') + duration('P1D'))");
        expect(calls).toBe(false);
        expect(sql).not.toContain('_era');
        expect(sql).toContain(') < 49 THEN REGEXP_REPLACE(');
        expect(sql).toContain('REGEXP_REPLACE(LTRIM(TO_CHAR(');
    });

    it('is compiled for a store without the functions to the SQL it was compiled to before them, byte for byte', () => {
        // A store an earlier version made gives the same rows until it is ensured: in `era-inline`, what the compiler gave
        // before liberation-data/drivine#609 for the graph g, at eeacd980. A change that compiles one of these otherwise
        // writes its file again.
        const at = "datetime(CASE k WHEN 0 THEN '2024-03-15T10:00:00+02:00' ELSE '2024-03-15T09:00:00Z' END)";
        const pinned: Record<string, string> = {
            zls5: `UNWIND [0, 1] AS k UNWIND range(1, 3) AS i WITH k, ${at} + duration({minutes: i}) AS t WITH k, collect(t) AS l RETURN [min(l)[0].hour, max(l)[0].hour]`,
            call5: "MATCH (n:CyTemporal) CALL { WITH n CALL { WITH n RETURN n.day + duration('P1D') AS e } RETURN e AS d } RETURN (d + duration('P1D')).day",
            'bc-read': "RETURN toString(date('-0044-03-15') + duration('P1D'))",
            'date-write':
                "CREATE (n:CyTemporal {id: 'w', day: date('-0044-03-15') + duration('P1D')}) RETURN toString(n.day)"
        };
        for (const [file, cypher] of Object.entries(pinned)) {
            const expected = fs.readFileSync(path.join(__dirname, 'era-inline', `${file}.sql`), 'utf8');
            const [sql, calls] = inline(cypher);
            expect([file, calls]).toEqual([file, false]);
            expect([file, sql]).toEqual([file, expected]);
            expect([file, stored(cypher)[1]]).toEqual([file, true]);
        }
    });

    it('is renumbered by the functions in a statement that writes, and in the step of a reduce, too', () => {
        // A schema function, unlike one a query declares, is called from a block's queries and from a reduce's own function.
        for (const cypher of [
            "CREATE (n:CyTemporal {day: date('-0044-03-15') + duration('P1D')}) RETURN toString(n.day)",
            "RETURN reduce(s = '', d IN [date('-0044-03-15')] | s + toString(d + duration('P1D')))"
        ]) {
            const [sql, calls] = stored(cypher);
            expect(calls).toBe(true);
            expect(sql).toContain('g_era(');
            expect(sql).toContain('g_era_date(');
            expect(sql).not.toContain('FUNCTION g_era');
            expect(sql).not.toContain('ASCII(');
            const [fallback, fallbackCalls] = inline(cypher);
            expect(fallbackCalls).toBe(false);
            expect(fallback).not.toContain('_era');
        }
    });

    it('is renumbered by a function where the SQL inline renumbers it, and not where the statement has told it the year is from 1000 on', () => {
        // A truncation of a date from 1000 on is written as it is (`TemporalSql.asAd`): no call, as no rewrite inline.
        const count = (sql: string, text: string): number => sql.split(text).length - 1;
        for (const cypher of [
            "MATCH (n:C) RETURN toString(date.truncate('month', n.day))",
            "MATCH (n:C) WHERE n.day < date('0001-01-01') RETURN toString(datetime.truncate('day', n.at))"
        ]) {
            const [sql] = stored(cypher);
            const [fallback] = inline(cypher);
            expect([cypher, count(sql, 'g_era_date(')]).toEqual([
                cypher,
                count(fallback, 'REGEXP_REPLACE(LTRIM(TO_CHAR(')
            ]);
            expect([cypher, count(sql, 'g_era(')]).toEqual([cypher, count(fallback, "'^(-[0-9]{4}|0000)'")]);
            expect(count(sql, 'g_era_date(')).toBeGreaterThan(0);
        }
    });

    it('is not looked for in a statement with no year to renumber, which compiles as it would without the functions', () => {
        for (const cypher of [
            'MATCH (n:Person) RETURN n.name',
            "RETURN date('2024-03-15').year",
            'UNWIND [1, 2] AS i RETURN i + 1'
        ]) {
            const [sql, calls] = stored(cypher);
            expect(calls).toBe(false);
            expect(sql).toEqual(inline(cypher)[0]);
        }
    });
});
