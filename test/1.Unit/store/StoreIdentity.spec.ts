import {
    ConstraintManager,
    GraphBackend,
    PersistenceManager,
    StoreIdentity,
    StoreIdentityResolver
} from '@liberation-data/drivine';
import { DrivineLogger } from '@/logger';

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
