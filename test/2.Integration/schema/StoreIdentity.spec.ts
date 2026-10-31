import {
    backendFor,
    DatabaseType,
    ModelRegistry,
    PersistenceManager,
    QuerySpecification,
    StatelessGraphObjectManager,
    uniquenessConstraint
} from '@liberation-data/drivine';
import { allStores, clearLabels, closeGraphEngines, persistenceManagerFor } from '../support/GraphEngines';
import { sqlPersistenceManager, SqlStore } from '../support/SqlStores';
import { DrivineLogger } from '@/logger';

// Schema DDL on Neo4j waits on schema locks other suites hold while they run in parallel.
jest.setTimeout(30_000);

/** How many rounds of managers racing to make the key's constraint each store runs: fewer on the SQL stores, as drivine4j. */
const RACE_ROUNDS: Partial<Record<DatabaseType, number>> = {
    [DatabaseType.ORACLE]: 2,
    [DatabaseType.POSTGRES]: 3
};

describe.each(allStores())('store identity on $type', (engine) => {
    let pm: PersistenceManager;
    const manager = (): StatelessGraphObjectManager =>
        new StatelessGraphObjectManager(pm, backendFor(engine.type), new ModelRegistry());
    const wipe = async (): Promise<void> => clearLabels(pm, engine, 'DrivineStore');
    const stamps = async (): Promise<unknown[]> => pm.query(backendFor(engine.type).storeStamps().spec());

    beforeAll(async () => {
        pm =
            engine.type === DatabaseType.ORACLE || engine.type === DatabaseType.POSTGRES
                ? sqlPersistenceManager(engine as SqlStore)
                : persistenceManagerFor(engine);
        await manager().constraints.drop(uniquenessConstraint('DrivineStore', 'key'));
        await wipe();
    });

    afterAll(async () => {
        await wipe();
        await manager().constraints.drop(uniquenessConstraint('DrivineStore', 'key'));
        await closeGraphEngines();
    });

    it('should mint an identity once, and report the same one again', async () => {
        const first = await manager().storeIdentity();
        expect(first.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(first.engine).toEqual(engine.type);
        expect((await manager().storeIdentity()).id).toEqual(first.id);
    });

    it('should agree on one identity when several managers resolve a virgin store at once', async () => {
        await wipe();
        const ids = await Promise.all([1, 2, 3, 4, 5].map(async () => (await manager().storeIdentity()).id));
        expect(new Set(ids).size).toEqual(1);
        expect(await stamps()).toHaveLength(1);
    });

    // #479, as drivine4j#473: on a store that has never had the key's constraint, the managers race to make it too. On
    // Neo4j they can deadlock doing so; elsewhere a loser's statement is refused for what the winner made. Going on
    // without the constraint, a loser's stamp was refused by the winner's, and thrown out of resolve(), or written before
    // it was in force, leaving two stamps. Each manager must instead find the winner's constraint, and write under it.
    it('should agree on one identity, under the key constraint, when many managers race to make it', async () => {
        const warn = jest.spyOn(DrivineLogger.prototype, 'warn');
        try {
            for (let round = 0; round < (RACE_ROUNDS[engine.type] ?? 5); round++) {
                await manager().constraints.drop(uniquenessConstraint('DrivineStore', 'key'));
                await wipe();
                const managers = Array.from({ length: 16 }, manager);
                const ids = await Promise.all(managers.map(async (it) => (await it.storeIdentity()).id));
                expect(new Set(ids).size).toEqual(1);
                expect(await stamps()).toHaveLength(1);
            }
            const bestEffort = warn.mock.calls
                .map(([message]) => String(message))
                .filter((it) => /best-effort/.test(it));
            expect(bestEffort).toEqual([]);
        } finally {
            warn.mockRestore();
        }
        // On Oracle each round builds the unique index over the whole node table, which the suites before this one have
        // filled: a run took 3 s on an empty table, 32 s on 300,000 nodes, and 50 s on a million with one CPU, and CI's
        // runner, slower still, took more than two minutes.
    }, 300_000);

    it("should replace a plain index on the key in the way of its constraint, the label being Drivine's", async () => {
        if (engine.type !== DatabaseType.NEO4J) {
            return;
        }
        const constraints = manager().constraints;
        await constraints.drop(uniquenessConstraint('DrivineStore', 'key'));
        await wipe();
        await pm.execute(new QuerySpecification('CREATE INDEX store_key_lookup FOR (n:DrivineStore) ON (n.key)'));

        expect((await manager().storeIdentity()).id).toMatch(/^[0-9a-f-]{36}$/);
        expect((await constraints.list()).some((it) => it.label === 'DrivineStore')).toBe(true);
        expect((await manager().indexes.list('RANGE')).some((it) => it.name === 'store_key_lookup')).toBe(false);
    });

    it('should mint a new identity for a store whose stamp is gone, as for new data', async () => {
        const before = (await manager().storeIdentity()).id;
        await wipe();
        expect((await manager().storeIdentity()).id).not.toEqual(before);
    });
});
