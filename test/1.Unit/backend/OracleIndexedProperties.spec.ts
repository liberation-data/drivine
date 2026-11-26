import { OracleIndexedProperties } from '@/backend/oracle/OracleIndexedProperties';
import { storeStatements } from '@/backend/StoreStatements';
import { DrivineLogger } from '@/logger/DrivineLogger';
import { OracleBackend } from '@/backend/oracle/OracleBackend';
import { OracleGraph } from '@/backend/oracle/OracleGraph';
import { PostgresBackend } from '@/backend/postgres/PostgresBackend';
import { PostgresGraph } from '@/backend/postgres/PostgresGraph';
import { GraphBackend } from '@/backend/GraphBackend';
import { ModelRegistry } from '@/model/ModelRegistry';
import { StatelessGraphObjectManager } from '@/manager/StatelessGraphObjectManager';

/** A connection that answers the catalog's query with `rows`, or fails with `error`, and counts what it's asked. */
const catalog = (rows: () => unknown[], error?: () => unknown) => {
    const asked: string[] = [];
    return {
        asked,
        execute: async (sql: string): Promise<{ rows: unknown[] }> => {
            asked.push(sql);
            return error ? Promise.reject(error()) : Promise.resolve({ rows: rows() });
        }
    };
};

const row = (label: string, properties: string[], kind = 'RANGE_INDEX') => ({
    ROW: { kind, label, properties }
});

describe('OracleIndexedProperties (#753)', () => {
    let now = 0;
    const realClock = OracleIndexedProperties.clock;
    // Each test its own graph, as what is read is remembered for the process.
    let graph = 0;
    const next = (): string => `ix_${++graph}`;

    beforeEach(() => {
        now = 0;
        OracleIndexedProperties.clock = () => now;
    });

    afterAll(() => {
        OracleIndexedProperties.clock = realClock;
    });

    it("reads each index's label and leading property with the module's labelled query", async () => {
        const g = next();
        const connection = catalog(() => [
            row('Person', ['email']),
            row('Order', ['ref', 'line'], 'UNIQUENESS_CONSTRAINT'),
            // A JSON column read as text.
            { ROW: JSON.stringify({ kind: 'RANGE_INDEX', label: 'City', properties: ['name'] }) },
            // Read as an array row too.
            [{ kind: 'RANGE_INDEX', label: 'Tag', properties: ['slug'] }],
            // None to tell the compiler of: no row, and an item without a label or a property.
            { ROW: null },
            row('', ['x']),
            row('Empty', [])
        ]);
        expect(await OracleIndexedProperties.of(connection, 'db', g)).toEqual([
            ['Person', 'email'],
            ['Order', 'ref'],
            ['City', 'name'],
            ['Tag', 'slug']
        ]);
        expect(connection.asked).toEqual([storeStatements('oracle', g).labelled]);
        expect(connection.asked[0]).toContain(`FROM ${g}_schema`);
    });

    it('reads once for the database, user and graph until it lapses, then again', async () => {
        const g = next();
        let listed = [row('A', ['x'])];
        const connection = catalog(() => listed);
        expect(await OracleIndexedProperties.of(connection, 'db', g)).toEqual([['A', 'x']]);
        listed = [row('B', ['y'])];
        now = OracleIndexedProperties.FRESH_FOR_MS - 1;
        expect(await OracleIndexedProperties.of(connection, 'db', g)).toEqual([['A', 'x']]);
        expect(connection.asked).toHaveLength(1);
        // Another database or user reads its own.
        expect(await OracleIndexedProperties.of(connection, 'other', g)).toEqual([['B', 'y']]);
        now = OracleIndexedProperties.FRESH_FOR_MS;
        expect(await OracleIndexedProperties.of(connection, 'db', g)).toEqual([['B', 'y']]);
        expect(connection.asked).toHaveLength(3);
    });

    it("reads again once an index of the graph is made or dropped, and only that graph's", async () => {
        const [g, other] = [next(), next()];
        let listed = [row('A', ['x'])];
        const connection = catalog(() => listed);
        await OracleIndexedProperties.of(connection, 'db', g);
        await OracleIndexedProperties.of(connection, 'db', other);
        listed = [];
        OracleIndexedProperties.changed(g);
        expect(await OracleIndexedProperties.of(connection, 'db', g)).toEqual([]);
        expect(await OracleIndexedProperties.of(connection, 'db', other)).toEqual([['A', 'x']]);
        expect(connection.asked).toHaveLength(3);
    });

    it("gives none, and keeps nothing, where the graph's schema table isn't there", async () => {
        const g = next();
        let missing = true;
        const connection = {
            asked: 0,
            execute: async (): Promise<{ rows: unknown[] }> => {
                connection.asked++;
                return missing
                    ? Promise.reject(
                          Object.assign(new Error('ORA-00942: table or view does not exist'), { errorNum: 942 })
                      )
                    : Promise.resolve({ rows: [row('A', ['x'])] });
            }
        };
        expect(await OracleIndexedProperties.of(connection, 'db', g)).toEqual([]);
        missing = false;
        expect(await OracleIndexedProperties.of(connection, 'db', g)).toEqual([['A', 'x']]);
        expect(connection.asked).toEqual(2);
    });

    it("compiles without them where the catalog can't be read, keeps what was read before, and says so once", async () => {
        const g = next();
        const warn = jest.spyOn(DrivineLogger.prototype, 'warn').mockImplementation(() => undefined);
        jest.spyOn(DrivineLogger.prototype, 'debug').mockImplementation(() => undefined);
        try {
            const refused = catalog(
                () => [],
                () => Object.assign(new Error('ORA-01031: insufficient privileges'), { errorNum: 1031 })
            );
            expect(await OracleIndexedProperties.of(refused, 'db', g)).toEqual([]);
            // Kept until it lapses, as a read that worked is.
            expect(await OracleIndexedProperties.of(refused, 'db', g)).toEqual([]);
            expect(refused.asked).toHaveLength(1);
            const healthy = catalog(() => [row('A', ['x'])]);
            now = OracleIndexedProperties.FRESH_FOR_MS;
            expect(await OracleIndexedProperties.of(healthy, 'db', g)).toEqual([['A', 'x']]);
            now = 2 * OracleIndexedProperties.FRESH_FOR_MS;
            expect(await OracleIndexedProperties.of(refused, 'db', g)).toEqual([['A', 'x']]);
            expect(warn).toHaveBeenCalledTimes(1);
            expect(warn.mock.calls[0][0]).toContain('ORA-01031');
        } finally {
            jest.restoreAllMocks();
        }
    });

    it('keeps a read begun after an index was made or dropped, though one begun before finds no schema table', async () => {
        const g = next();
        const answers: Array<(it: { rows: unknown[] } | Error) => void> = [];
        const connection = {
            asked: 0,
            execute: async (): Promise<{ rows: unknown[] }> => {
                connection.asked++;
                return new Promise((resolve, reject) =>
                    answers.push((it) => (it instanceof Error ? reject(it) : resolve(it)))
                );
            }
        };
        const before = OracleIndexedProperties.of(connection, 'db', g);
        OracleIndexedProperties.changed(g);
        const after = OracleIndexedProperties.of(connection, 'db', g);
        answers[1]({ rows: [row('A', ['x'])] });
        expect(await after).toEqual([['A', 'x']]);
        answers[0](Object.assign(new Error('ORA-00942: table or view does not exist'), { errorNum: 942 }));
        expect(await before).toEqual([]);
        // Asked at once, and the same answer, of a second statement meanwhile.
        expect(await Promise.all([1, 2].map(async () => OracleIndexedProperties.of(connection, 'db', g)))).toEqual([
            [['A', 'x']],
            [['A', 'x']]
        ]);
        expect(connection.asked).toEqual(2);
    });

    it('takes a graph named in either case as one, as Oracle does', async () => {
        const g = next();
        let listed = [row('A', ['x'])];
        const connection = catalog(() => listed);
        expect(await OracleIndexedProperties.of(connection, 'db', g)).toEqual([['A', 'x']]);
        expect(await OracleIndexedProperties.of(connection, 'db', g.toUpperCase())).toEqual([['A', 'x']]);
        expect(connection.asked).toHaveLength(1);
        listed = [];
        OracleIndexedProperties.changed(g.toUpperCase());
        expect(await OracleIndexedProperties.of(connection, 'db', g)).toEqual([]);
    });
});

describe("The object manager's schema plan (#753)", () => {
    afterEach(() => jest.restoreAllMocks());

    /** What the manager's plan tells its host once a statement has made or dropped an index or constraint. */
    const changedOn = (backend: GraphBackend): void => {
        const pm = { database: 'db', type: 'ORACLE' } as any;
        // No statement is run here: the executor a plan runs its statements with is none.
        jest.spyOn(StatelessGraphObjectManager.prototype as any, 'schemaExecutor').mockReturnValue({});
        new StatelessGraphObjectManager(pm, backend, new ModelRegistry()).schemaPlanning().host.changed!();
    };

    it("has an Oracle graph's labelled indexes read again once one is made or dropped, and no other store's", () => {
        const changed = jest.spyOn(OracleIndexedProperties, 'changed');
        changedOn(new OracleBackend(new OracleGraph('planned')));
        expect(changed.mock.calls).toEqual([['planned']]);
        changedOn(new PostgresBackend(new PostgresGraph('planned')));
        expect(changed).toHaveBeenCalledTimes(1);
    });
});
