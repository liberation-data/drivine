import {
    backendFor,
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
 * having made the constraint.
 */
const neo4jStore = (createFailures: number, mergeFailures: Error[], madeMeanwhile?: Error): Neo4jStore => {
    let created = false;
    let creates = 0;
    let merges = 0;
    const connection = {
        query: async (spec: QuerySpecification<unknown>) => {
            const statement = spec.statement.text;
            if (statement.startsWith('CREATE CONSTRAINT')) {
                if (++creates <= createFailures) {
                    created = madeMeanwhile != null;
                    return Promise.reject(
                        madeMeanwhile ??
                            new Neo4jError(
                                "ForsetiClient can't acquire EXCLUSIVE LABEL because holders of that lock are waiting for " +
                                    'ForsetiClient. Deadlock wait cycle.',
                                'Neo.TransientError.Transaction.DeadlockDetected'
                            )
                    );
                }
                created = true;
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
        type: DatabaseType.NEO4J,
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
});
