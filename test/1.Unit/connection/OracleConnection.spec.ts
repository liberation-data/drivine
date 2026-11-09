import { OracleConnection } from '@/connection/oracle/OracleConnection';
import { OracleResultMapper } from '@/connection/oracle/OracleResultMapper';
import { QuerySpecification } from '@/query/QuerySpecification';

/**
 * A session whose check of the graph's nulls_equal gives `check`, and of its era functions `era`, and whose every other
 * statement gives no rows.
 */
function session(check: 'found' | number, era: 'found' | number = 'found'): { execute: jest.Mock } {
    const outcome = async (it: 'found' | number): Promise<unknown> =>
        it === 'found'
            ? Promise.resolve({ rows: [[1]] })
            : Promise.reject(Object.assign(new Error(`ORA-${it}`), { errorNum: it }));
    return {
        execute: jest.fn(async (sql: string) => {
            if (sql.startsWith('SELECT ') && sql.includes("(JSON('[1]'), JSON('[1]')) FROM DUAL")) {
                return outcome(check);
            }
            if (sql.startsWith('SELECT ') && sql.includes("_era('0000-01-01')")) {
                return outcome(era);
            }
            return Promise.resolve({ rows: [] });
        })
    };
}

const cypher = (text: string): QuerySpecification<unknown> => new QuerySpecification({ text, language: 'CYPHER' });

/** A Cypher statement comparing two lists that may hold a null (#367). */
const COMPARED = 'WITH [null] AS a, [1] AS b RETURN a = b';

/** A Cypher statement that reads and writes a date whose year is BC (liberation-data/drivine#609). */
const BC = "RETURN toString(date('-0044-03-15') + duration('P1D'))";

/** A Cypher statement that does both, a write, whose block calls the store's functions alone. */
const BOTH =
    "CREATE (n:T {day: date('-0044-03-15') + duration('P1D')}) WITH n, [null] AS a, [1] AS b RETURN [a = b, toString(n.day)]";

/**
 * Which function a Cypher statement compares values that may hold a null by on Oracle: the store's, where the session
 * may call it, and none of the store's where it may not (#367).
 */
describe('OracleConnection', () => {
    let graphs = 0;
    /** A graph of its own for each test: what a session found is remembered for the process. */
    const graph = (): string => `conn_${++graphs}_${Date.now()}`;

    it("should call the store's function where the session may call it", async () => {
        const g = graph();
        const it = session('found');
        await new OracleConnection(it as any, new OracleResultMapper(), 'oracle.1', g, 'db|me').query(cypher(COMPARED));
        const run = it.execute.mock.calls.map(([sql]) => sql as string);
        expect(run).toHaveLength(2);
        expect(run[1]).toContain(`${g}_nulls_equal(`);
        expect(run[1]).not.toContain('cy_nulls_equal');
    });

    it('should compile again to call none of the store where the session may not call it', async () => {
        const g = graph();
        const it = session(904);
        await new OracleConnection(it as any, new OracleResultMapper(), 'oracle.1', g, 'db|me').query(cypher(COMPARED));
        const run = it.execute.mock.calls.map(([sql]) => sql as string);
        expect(run).toHaveLength(2);
        expect(run[1]).not.toContain(`${g}_nulls_equal`);
        expect(run[1]).toContain('cy_nulls_equal(');
    });

    it('should bind an iterator in a parameter as its items when it compiles again, as the first compile does (#662)', async () => {
        function* ids(): Generator<string> {
            yield 'a';
            yield 'b';
        }
        const text = 'WITH [null] AS a, $p.ids AS b RETURN [a = b, b]';
        const bound = async (items: Iterable<string>): Promise<unknown> => {
            const it = session(904);
            await new OracleConnection(it as any, new OracleResultMapper(), 'oracle.1', graph(), 'db|me').query(
                cypher(text).bind({ p: { ids: items } })
            );
            const run = it.execute.mock.calls;
            expect(run).toHaveLength(2);
            expect(run[1][0]).toContain('cy_nulls_equal(');
            return run[1][1];
        };
        expect(await bound(ids())).toEqual(await bound(['a', 'b']));
    });

    it.each([
        ['both', 'found', 'found', true, true],
        ['nulls_equal alone', 'found', 904, true, false],
        ['the era functions alone', 904, 'found', false, true],
        ['neither', 904, 904, false, false]
    ] as const)(
        "should ask of nulls_equal and the era functions apart, and call those of the store's the session may: %s",
        async (_, nullsEqual, era, callsNullsEqual, callsEra) => {
            const g = graph();
            const it = session(nullsEqual, era);
            await new OracleConnection(it as any, new OracleResultMapper(), 'oracle.1', g, 'db|me').query(cypher(BOTH));
            const run = it.execute.mock.calls.map(([sql]) => sql as string);
            expect(run).toHaveLength(3);
            expect(run[0]).toContain(`${g}_nulls_equal(JSON('[1]')`);
            expect(run[1]).toContain(`${g}_era('0000-01-01')`);
            expect(run[2].includes(`${g}_nulls_equal(`)).toBe(callsNullsEqual);
            expect(run[2].includes(`${g}_era(`) && run[2].includes(`${g}_era_date(`)).toBe(callsEra);
            expect(run[2].includes(`${g}_era`)).toBe(callsEra);
            expect(run[2].includes(') < 49 THEN REGEXP_REPLACE(')).toBe(!callsEra);
        }
    );

    it('should ask of the era functions alone for a statement that renumbers a year and compares no list', async () => {
        const g = graph();
        const it = session(904, 904);
        await new OracleConnection(it as any, new OracleResultMapper(), 'oracle.1', g, 'db|me').query(cypher(BC));
        const run = it.execute.mock.calls.map(([sql]) => sql as string);
        expect(run).toHaveLength(2);
        expect(run[0]).toContain(`${g}_era('0000-01-01')`);
        expect(run[1]).not.toContain('_era');
        expect(run[1]).not.toContain('nulls_equal');
    });

    it('should ask nothing of a statement that compares no value that may hold a null', async () => {
        const g = graph();
        const it = session(904);
        await new OracleConnection(it as any, new OracleResultMapper(), 'oracle.1', g, 'db|me').query(
            cypher('RETURN 1 = 1')
        );
        expect(it.execute).toHaveBeenCalledTimes(1);
        expect(it.execute.mock.calls[0][0]).not.toContain('nulls_equal');
    });

    it("should keep a statement compiled from Cypher out of the driver's cache, and a SQL one in it", async () => {
        // A kept compiled statement holds megabytes of Oracle's memory (liberation-data/drivine4j#313); Drivine's own SQL
        // is cheap to keep.
        const it = session(904);
        const connection = new OracleConnection(it as any, new OracleResultMapper(), 'oracle.1', graph(), 'db|me');
        await connection.query(cypher('MATCH (n) RETURN n'));
        await connection.query(new QuerySpecification('SELECT 1 FROM dual'));
        const kept = it.execute.mock.calls.map((call) => (call as any[])[2].keepInStmtCache);
        expect(kept).toEqual([false, true]);
    });

    it('should report a check that fails for any reason but there being no function, and run no statement', async () => {
        const g = graph();
        const it = session(3113);
        await expect(
            new OracleConnection(it as any, new OracleResultMapper(), 'oracle.1', g, 'db|me').query(cypher(COMPARED))
        ).rejects.toMatchObject({ errorNum: 3113 });
        expect(it.execute).toHaveBeenCalledTimes(1);
    });
});
