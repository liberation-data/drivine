import {
    backendFor,
    CONTENDED_ATTEMPTS,
    Connection,
    ConnectionProvider,
    ConstraintManager,
    DatabaseType,
    DrivineError,
    GraphBackend,
    PersistenceManager,
    QuerySpecification,
    SchemaExecutor,
    schemaGrammarFor,
    StoreIdentity,
    StoreIdentityResolver
} from '@liberation-data/drivine';
import { DrivineLogger } from '@/logger';
import { Neo4jError } from 'neo4j-driver';

interface Resolved {
    resolver: StoreIdentityResolver;
    executed: unknown[];
}

/** A store whose key constraint `ensure` answers with `outcome`, and which holds one stamp once written. */
const resolverFor = (outcome: unknown): Resolved => {
    const executed: unknown[] = [];
    const persistenceManager = {
        database: 'neo4j',
        type: 'NEO4J',
        execute: async (spec: unknown) => {
            executed.push(spec);
            return Promise.resolve();
        },
        query: async () => Promise.resolve([{ id: 'abc', assignedAt: '2026-01-01T00:00:00Z' }])
    } as unknown as PersistenceManager;
    const backend = {
        storeStamps: () => ({ spec: () => ({}) }),
        assignStoreStamp: () => ({ spec: () => ({}) })
    } as unknown as GraphBackend;
    const constraints = { ensure: async () => Promise.resolve(outcome) } as unknown as ConstraintManager;
    return { resolver: new StoreIdentityResolver(persistenceManager, backend, constraints), executed };
};

describe("The store key's constraint", () => {
    let warn: jest.SpyInstance;
    beforeEach(() => {
        warn = jest.spyOn(DrivineLogger.prototype, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => jest.restoreAllMocks());

    const warned = () => warn.mock.calls.map(([message]) => String(message)).join('\n');

    it('should be warned of, naming the index and the database, with an index in the way of it, and identity still resolve', async () => {
        const { resolver, executed }: Resolved = resolverFor({
            status: 'BLOCKED_BY_INDEX',
            index: { label: 'DrivineStore', properties: ['key'], name: 'hand_made' }
        });

        const identity: StoreIdentity = await resolver.resolve();

        // As drivine4j: best-effort until the index is dropped, so the stamp is still written and read.
        expect(identity.id).toBe('abc');
        expect(executed).toHaveLength(1);
        expect(warned()).toContain('hand_made');
        expect(warned()).toContain('in the way');
        expect(warned()).toContain('neo4j');
    });

    it('should be warned of in words, not "undefined", when the index in the way has no name', async () => {
        const { resolver }: Resolved = resolverFor({ status: 'BLOCKED_BY_INDEX' });

        await resolver.resolve();

        expect(warned()).toContain('in the way');
        expect(warned()).not.toContain('undefined');
    });

    it('should not be warned of when it is in force', async () => {
        const { resolver }: Resolved = resolverFor({ status: 'CREATED' });

        await resolver.resolve();

        expect(warn).not.toHaveBeenCalled();
    });
});

interface Neo4jStore {
    resolver: StoreIdentityResolver;
    creates: () => number;
    merges: () => number;
}

/**
 * A Neo4j store whose schema statements run through the real ConstraintManager and SchemaExecutor, so a deadlock making
 * the constraint is run again as it would be, and whose stamp MERGE fails with the next of `mergeFailures`, if any. The
 * first `createFailures` CREATE CONSTRAINTs deadlock, or, given `madeMeanwhile`, are refused with it, another session
 * having made the constraint, unless `foundAfter` is false: then nothing made it, and the refusal is for something else.
 * Given a list, the nth CREATE is refused with its nth, and deadlocks past its end. The stamp is written as on
 * `stampedOn`, so a SQL store's refusal of it is judged by its code. Given `listedBy`, another manager's constraint is
 * listed from the first SHOW CONSTRAINTS for which it answers true, told how many CREATEs and SHOWs there have been.
 */
const neo4jStore = (
    createFailures: number,
    mergeFailures: Error[],
    madeMeanwhile?: Error | Error[],
    foundAfter: boolean = true,
    stampedOn: DatabaseType = DatabaseType.NEO4J,
    listedBy?: (creates: number, shows: number) => boolean
): Neo4jStore => {
    let created = false;
    let creates = 0;
    let shows = 0;
    let merges = 0;
    const connection = {
        query: async (spec: QuerySpecification<unknown>) => {
            const statement = spec.statement.text;
            if (statement.startsWith('CREATE CONSTRAINT')) {
                if (++creates <= createFailures) {
                    const refusal = Array.isArray(madeMeanwhile) ? madeMeanwhile[creates - 1] : madeMeanwhile;
                    created = refusal != null && foundAfter;
                    return Promise.reject(
                        refusal ??
                            new Neo4jError(
                                "ForsetiClient can't acquire EXCLUSIVE LABEL because holders of that lock are waiting for " +
                                    'ForsetiClient. Deadlock wait cycle.',
                                'Neo.TransientError.Transaction.DeadlockDetected'
                            )
                    );
                }
                created = true;
            }
            if (statement.startsWith('SHOW CONSTRAINTS')) {
                created = created || (listedBy?.(creates, ++shows) ?? false);
            }
            return Promise.resolve(
                statement.startsWith('SHOW CONSTRAINTS') && created
                    ? [{ name: 'DrivineStore_key', labels: ['DrivineStore'], properties: ['key'] }]
                    : []
            );
        },
        release: async () => Promise.resolve()
    } as unknown as Connection;
    const provider = {
        name: 'neo4j',
        type: DatabaseType.NEO4J,
        connect: async () => Promise.resolve(connection)
    } as unknown as ConnectionProvider;
    const persistenceManager = {
        database: 'neo4j',
        type: stampedOn,
        execute: async () => {
            merges++;
            const failure = mergeFailures.shift();
            return failure ? Promise.reject(DrivineError.withRootCause(failure)) : Promise.resolve();
        },
        query: async () => Promise.resolve([{ id: 'store-8', assignedAt: '2026-01-01T00:00:00Z' }])
    } as unknown as PersistenceManager;
    const constraints = new ConstraintManager(new SchemaExecutor(provider), schemaGrammarFor(DatabaseType.NEO4J));
    return {
        resolver: new StoreIdentityResolver(persistenceManager, backendFor(DatabaseType.NEO4J), constraints),
        creates: () => creates,
        merges: () => merges
    };
};

// #479, as drivine4j#473: managers making the key's constraint at once on Neo4j deadlock on the label's lock.
describe('Managers making the store key constraint at once', () => {
    let warn: jest.SpyInstance;
    beforeEach(() => {
        warn = jest.spyOn(DrivineLogger.prototype, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => jest.restoreAllMocks());

    const warned = () => warn.mock.calls.map(([message]) => String(message)).join('\n');

    it('should write again a stamp the constraint refuses, though its making deadlocked, for the refusal proves it is in force', async () => {
        const refused = new Neo4jError(
            "Node(0) already exists with label `DrivineStore` and property `key` = 'singleton'",
            'Neo.ClientError.Schema.ConstraintValidationFailed'
        );
        const { resolver, creates, merges }: Neo4jStore = neo4jStore(Number.MAX_SAFE_INTEGER, [refused]);

        expect((await resolver.resolve()).id).toEqual('store-8');
        expect(creates()).toBeGreaterThan(1);
        expect(merges()).toEqual(2);
    });

    it('should make again a constraint whose making deadlocked once, so the stamp is written under it', async () => {
        // Only under a constraint confirmed is a conflict taken for a lost race, and the stamp written again.
        const conflict = new Error('Cannot resolve conflicting transactions. You can retry this transaction.');
        const { resolver, creates, merges }: Neo4jStore = neo4jStore(1, [conflict]);

        expect((await resolver.resolve()).id).toEqual('store-8');
        expect(creates()).toEqual(2);
        expect(merges()).toEqual(2);
    });

    it('should ensure the constraint again when its making was refused for what another manager made meanwhile', async () => {
        // As FalkorDB refuses a second CREATE CONSTRAINT, and Postgres an index whose name another session took in pg_class.
        const { resolver, creates, merges }: Neo4jStore = neo4jStore(
            1,
            [new Error('Cannot resolve conflicting transactions. You can retry this transaction.')],
            new Error('Constraint already exists.')
        );

        expect((await resolver.resolve()).id).toEqual('store-8');
        // The second ensure finds the other's constraint, so it isn't made again, and the stamp is written under it.
        expect(creates()).toEqual(1);
        expect(merges()).toEqual(2);
        expect(warned()).not.toContain('best-effort');
    });

    it('should not write again a stamp refused for another reason after the deadlock', async () => {
        const refused = new Neo4jError('Invalid input', 'Neo.ClientError.Statement.SyntaxError');
        const { resolver, merges }: Neo4jStore = neo4jStore(Number.MAX_SAFE_INTEGER, [refused]);

        await expect(resolver.resolve()).rejects.toMatchObject({ rootCause: refused });
        expect(merges()).toEqual(1);
    });

    it('should warn that identity is best-effort when its making is refused as made meanwhile each time, though nothing made it', async () => {
        // A real misconfiguration: Neo4j's index in the way that ensure couldn't find, so the constraint is never there.
        const { resolver, creates, merges }: Neo4jStore = neo4jStore(
            Number.MAX_SAFE_INTEGER,
            [],
            new Error('There already exists an index (:DrivineStore {key}).'),
            false
        );

        expect((await resolver.resolve()).id).toEqual('store-8');
        expect(creates()).toEqual(3);
        expect(merges()).toEqual(1);
        expect(warned()).toContain('best-effort');
        expect(warned()).toContain('There already exists an index');
    });

    it('should ensure the constraint again when Postgres refused its index for a name another session took in pg_class', async () => {
        // As node-postgres gives it, racing CREATE UNIQUE INDEX IF NOT EXISTS on a real server.
        const raced = Object.assign(
            new Error('duplicate key value violates unique constraint "pg_class_relname_nsp_index"'),
            { code: '23505', schema: 'pg_catalog', table: 'pg_class', constraint: 'pg_class_relname_nsp_index' }
        );
        const { resolver, creates }: Neo4jStore = neo4jStore(1, [], DrivineError.withRootCause(raced));

        expect((await resolver.resolve()).id).toEqual('store-8');
        expect(creates()).toEqual(1);
        expect(warned()).not.toContain('best-effort');
    });

    it('should not ensure the constraint again for a unique violation outside the catalog, which nothing made meanwhile', async () => {
        const violated = Object.assign(new Error('duplicate key value violates unique constraint "orders_pkey"'), {
            code: '23505',
            constraint: 'orders_pkey'
        });
        const { resolver, creates }: Neo4jStore = neo4jStore(1, [], DrivineError.withRootCause(violated), false);

        expect((await resolver.resolve()).id).toEqual('store-8');
        expect(creates()).toEqual(1);
        expect(warned()).toContain('best-effort');
    });

    it('should not ensure the constraint again for a unique violation in the rows of a graph whose name starts pg_', async () => {
        // A graph named pg_store has unique indexes named pg_store_uq_...: the row's table is in public, not the catalog.
        const violated = Object.assign(
            new Error('duplicate key value violates unique constraint "pg_store_uq_drivinestore_key"'),
            { code: '23505', schema: 'public', table: 'pg_store_nodes', constraint: 'pg_store_uq_drivinestore_key' }
        );
        const { resolver, creates }: Neo4jStore = neo4jStore(1, [], DrivineError.withRootCause(violated), false);

        expect((await resolver.resolve()).id).toEqual('store-8');
        expect(creates()).toEqual(1);
        expect(warned()).toContain('best-effort');
    });

    it('should not ensure the constraint again for a deadlock the schema executor already gave up on', async () => {
        // The executor ran it as many times as it runs one; ensuring again would run it as many times again, each.
        const deadlock = new Neo4jError(
            "ForsetiClient can't acquire EXCLUSIVE LABEL: the lock its index already exists under is held. Deadlock wait cycle.",
            'Neo.TransientError.Transaction.DeadlockDetected'
        );
        const { resolver, creates }: Neo4jStore = neo4jStore(Number.MAX_SAFE_INTEGER, [], deadlock, false);

        expect((await resolver.resolve()).id).toEqual('store-8');
        expect(creates()).toEqual(CONTENDED_ATTEMPTS);
        expect(warned()).toContain('best-effort');
    });

    it("should find the winner's constraint when its own making deadlocked as many times as the executor runs one", async () => {
        // CI's 16 managers (run 41260212023): this one lost every round of the label's lock, while another made it.
        const { resolver, creates, merges }: Neo4jStore = neo4jStore(
            Number.MAX_SAFE_INTEGER,
            [new Error('Cannot resolve conflicting transactions. You can retry this transaction.')],
            undefined,
            true,
            DatabaseType.NEO4J,
            (made) => made >= CONTENDED_ATTEMPTS
        );

        expect((await resolver.resolve()).id).toEqual('store-8');
        expect(creates()).toEqual(CONTENDED_ATTEMPTS);
        // Under the constraint found, a conflict is a lost race, and the stamp is written again.
        expect(merges()).toEqual(2);
        expect(warned()).not.toContain('best-effort');
    });

    it("should look again for the winner's constraint, after a pause, while the winner is still making it", async () => {
        const { resolver, creates }: Neo4jStore = neo4jStore(
            Number.MAX_SAFE_INTEGER,
            [],
            undefined,
            true,
            DatabaseType.NEO4J,
            // The ensure's first look, then the first two looks after the deadlocks, find nothing.
            (made, shows) => made >= CONTENDED_ATTEMPTS && shows > 3
        );

        expect((await resolver.resolve()).id).toEqual('store-8');
        expect(creates()).toEqual(CONTENDED_ATTEMPTS);
        expect(warned()).not.toContain('best-effort');
    });

    it("should look for the winner's constraint only so long after the deadlocks, and then warn", async () => {
        let looks = 0;
        const { resolver }: Neo4jStore = neo4jStore(
            Number.MAX_SAFE_INTEGER,
            [],
            undefined,
            true,
            DatabaseType.NEO4J,
            (_, shows) => (looks = shows) < 0
        );

        expect((await resolver.resolve()).id).toEqual('store-8');
        // The ensure's own look, then the resolver's eight (LOOKS_FOR_THE_WINNER) after it gave up.
        expect(looks).toEqual(1 + 8);
        expect(warned()).toContain('best-effort');
    });

    it('should run the constraint at most twice refused at once and then as many times as the executor runs one', async () => {
        // The worst case: ensured again for each refusal made meanwhile, until the last ensure, whose deadlocks the
        // executor runs again in full. Not three ensures of CONTENDED_ATTEMPTS each.
        const refusal = new Error('There already exists an index (:DrivineStore {key}).');
        const { resolver, creates }: Neo4jStore = neo4jStore(Number.MAX_SAFE_INTEGER, [], [refusal, refusal], false);

        expect((await resolver.resolve()).id).toEqual('store-8');
        expect(creates()).toEqual(2 + CONTENDED_ATTEMPTS);
        expect(warned()).toContain('best-effort');
    });

    it.each([
        [
            'Postgres',
            DatabaseType.POSTGRES,
            Object.assign(new Error('relation "drivine_nodes" already exists'), { code: '42P07' })
        ],
        [
            'Oracle',
            DatabaseType.ORACLE,
            Object.assign(new Error('ORA-02261: such unique or primary key already exists in the table'), {
                errorNum: 2261
            })
        ]
    ])(
        'should not write again a stamp %s refused for something else that already exists',
        async (_, store, refused) => {
            // Judged by its code, not its words: a SQL store's other "already exists" fails the same way each time.
            const { resolver, merges }: Neo4jStore = neo4jStore(0, [refused], undefined, true, store);

            await expect(resolver.resolve()).rejects.toMatchObject({ rootCause: refused });
            expect(merges()).toEqual(1);
        }
    );

    it.each([
        [
            'Postgres',
            DatabaseType.POSTGRES,
            Object.assign(new Error('duplicate key value violates unique constraint "drivine_uq_drivinestore_key"'), {
                code: '23505'
            })
        ],
        [
            'Oracle',
            DatabaseType.ORACLE,
            Object.assign(new Error('ORA-00001: unique constraint (DRIVINE.DRIVINE_UQ_DRIVINESTORE_KEY) violated'), {
                errorNum: 1
            })
        ]
    ])('should write again a stamp %s refused as a unique violation', async (_, store, refused) => {
        const { resolver, merges }: Neo4jStore = neo4jStore(0, [refused], undefined, true, store);

        expect((await resolver.resolve()).id).toEqual('store-8');
        expect(merges()).toEqual(2);
    });

    it('should not write again a stamp refused by a constraint that is not a uniqueness one', async () => {
        // Only a uniqueness violation proves the key's constraint in force; a not-null one fails the same way each time.
        const refused = new Error('null value in column "props" of relation "nodes" violates not-null constraint');
        const { resolver, merges }: Neo4jStore = neo4jStore(Number.MAX_SAFE_INTEGER, [refused]);

        await expect(resolver.resolve()).rejects.toMatchObject({ rootCause: refused });
        expect(merges()).toEqual(1);
    });

    it('should not write again a stamp a store without schema management refused, for no constraint of its can have', async () => {
        const refused = new Error("Node(0) already exists with label `DrivineStore` and property `key` = 'singleton'");
        let merges = 0;
        const persistenceManager = {
            database: 'neptune',
            type: DatabaseType.NEPTUNE,
            execute: async () => {
                merges++;
                return Promise.reject(refused);
            }
        } as unknown as PersistenceManager;
        const resolver = new StoreIdentityResolver(persistenceManager, backendFor(DatabaseType.NEO4J));

        await expect(resolver.resolve()).rejects.toBe(refused);
        expect(merges).toEqual(1);
    });
});
