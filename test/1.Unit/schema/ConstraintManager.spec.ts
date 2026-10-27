import {
    ConstraintManager,
    DrivineError,
    FALKORDB_SCHEMA,
    NEO4J_SCHEMA,
    GraphBackend,
    PersistenceManager,
    SchemaExecutor,
    StoreIdentityResolver,
    uniquenessConstraint
} from '@liberation-data/drivine';
import { DrivineLogger } from '@/logger';

const inTheWay = (): Error =>
    Object.assign(
        new Error(
            'There already exists an index (:Person {email}). A constraint cannot be created until the index has been dropped.'
        ),
        { code: 'Neo.ClientError.Schema.IndexAlreadyExists' }
    );

const rangeRow = (name: string, ...properties: string[]) => ({ name, labels: ['Person'], properties });

/**
 * A Neo4j that refuses the constraint for an index in the way of it until DROP INDEX has run, and answers the query for
 * keys held more than once with `conflicts`, or fails it when that is an error. Given `refusedAfterDrop`, it refuses
 * the constraint with that once the index is gone too.
 */
function blockedStore(indexes: object[], conflicts: unknown[] | Error = [], refusedAfterDrop?: Error) {
    const ran: string[] = [];
    let dropped = false;
    let created = false;
    const answer = (statement: string): unknown[] => {
        ran.push(statement);
        if (statement.startsWith('DROP INDEX')) {
            dropped = true;
            return [];
        }
        if (statement.startsWith('CREATE CONSTRAINT')) {
            if (!dropped) {
                throw DrivineError.withRootCause(inTheWay());
            }
            if (refusedAfterDrop) {
                throw refusedAfterDrop;
            }
            created = true;
            return [];
        }
        if (statement.startsWith('SHOW CONSTRAINTS')) {
            return created ? [{ name: 'Person_email_unique', labels: ['Person'], properties: ['email'] }] : [];
        }
        if (statement.startsWith('SHOW INDEXES')) {
            return dropped ? [] : indexes;
        }
        if (statement.includes('holders > 1')) {
            if (conflicts instanceof Error) {
                throw conflicts;
            }
            return conflicts;
        }
        return [];
    };
    const executor = {
        run: async (statement: string) => Promise.resolve().then(() => answer(statement))
    } as unknown as SchemaExecutor;
    return { constraints: new ConstraintManager(executor, NEO4J_SCHEMA), ran };
}

describe('ConstraintManager with an index in the way of a constraint', () => {
    const spec = uniquenessConstraint('Person', 'email');
    const drops = (ran: string[]) => ran.filter((it) => it.startsWith('DROP INDEX'));

    it('should report the index by name, and leave it', async () => {
        const store = blockedStore([rangeRow('person_email', 'email')]);
        expect(await store.constraints.ensure(spec)).toEqual({
            status: 'BLOCKED_BY_INDEX',
            spec,
            index: { label: 'Person', properties: ['email'], name: 'person_email' }
        });
        expect(drops(store.ran)).toEqual([]);
    });

    it('should drop the index and make the constraint, when asked', async () => {
        const store = blockedStore([rangeRow('person_email', 'email')]);
        expect(await store.constraints.ensure(spec, undefined, true)).toEqual({ status: 'CREATED', spec });
        const dropped = store.ran.indexOf('DROP INDEX person_email IF EXISTS');
        expect(dropped).toBeGreaterThanOrEqual(0);
        expect(store.ran.slice(dropped).some((it) => it.startsWith('CREATE CONSTRAINT'))).toBe(true);
    });

    it('should keep the index, and report the violation, when a key is held more than once', async () => {
        const held = [
            { properties: { email: 'x@y' }, count: 2, nodes: [{ elementId: '4:a:1' }, { elementId: '4:a:2' }] }
        ];
        const sampled = blockedStore([rangeRow('person_email', 'email')], held);
        expect(await sampled.constraints.ensure(spec, 10, true)).toEqual({ status: 'VIOLATION', spec, sample: held });
        expect(drops(sampled.ran)).toEqual([]);
        // Asked for no sample, the data is still read, by the same query, before the index is dropped.
        const unsampled = blockedStore([rangeRow('person_email', 'email')], held);
        expect(await unsampled.constraints.ensure(spec, 0, true)).toEqual({ status: 'VIOLATION', spec, sample: [] });
        expect(unsampled.ran).toContain(NEO4J_SCHEMA.conflicts(spec, 1));
        expect(drops(unsampled.ran)).toEqual([]);
    });

    it("should keep the index, and throw the refusal, when the data can't be read", async () => {
        const store = blockedStore([rangeRow('person_email', 'email')], new Error('connection lost'));
        await expect(store.constraints.ensure(spec, 0, true)).rejects.toThrow(/There already exists an index/);
        expect(drops(store.ran)).toEqual([]);
    });

    it('should throw what refuses the constraint once the index is dropped, the index being gone', async () => {
        const store = blockedStore([rangeRow('person_email', 'email')], [], new Error('schema lock timed out'));
        await expect(store.constraints.ensure(spec, undefined, true)).rejects.toThrow('schema lock timed out');
        expect(drops(store.ran)).toEqual(['DROP INDEX person_email IF EXISTS']);
        expect(await store.constraints.list()).toEqual([]);
    });

    it("should take the index over the constraint's properties in their order", async () => {
        const store = blockedStore([
            rangeRow('email_tenant', 'email', 'tenant'),
            rangeRow('tenant_email', 'tenant', 'email')
        ]);
        const result = await store.constraints.ensure(uniquenessConstraint('Person', ['tenant', 'email']));
        expect([result.status, result.index?.name]).toEqual(['BLOCKED_BY_INDEX', 'tenant_email']);
    });

    it('should throw the refusal when there is no such index', async () => {
        const store = blockedStore([rangeRow('person_name', 'name')]);
        await expect(store.constraints.ensure(spec, undefined, true)).rejects.toThrow(/There already exists an index/);
        expect(drops(store.ran)).toEqual([]);
    });
});

describe('ConstraintManager on FalkorDB, which builds a constraint in the background', () => {
    const spec = uniquenessConstraint('Person', 'email');
    const repeated = {
        properties: { email: 'dup@example.com' },
        count: 2,
        nodes: [{ elementId: 1 }, { elementId: 2 }]
    };
    const other = { properties: { email: 'other@example.com' }, count: 2, nodes: [{ elementId: 3 }, { elementId: 4 }] };

    /**
     * A FalkorDB whose constraint, once made, is missing from the first `pending` listings and then has `status` until
     * it is dropped. It answers the query for keys held more than once with `conflicts` in turn, the last one from then
     * on, or fails it when that is an error.
     */
    function falkorDb(status: 'OPERATIONAL' | 'FAILED', pending: number = 1, ...conflicts: (unknown[] | Error)[]) {
        const ran: unknown[] = [];
        let made = false;
        let listings = 0;
        let reads = 0;
        const answer = (statement: any): unknown[] => {
            ran.push(statement);
            if (statement?.native === 'CONSTRAINT_CREATE') {
                made = true;
                return [];
            }
            if (statement?.native === 'CONSTRAINT_DROP') {
                made = false;
                return [];
            }
            if (statement === FALKORDB_SCHEMA.listUniques.statement && made) {
                listings++;
                return listings <= pending ? [] : [{ label: 'Person', properties: ['email'], status }];
            }
            if (typeof statement === 'string' && statement.includes('holders > 1')) {
                const answer = conflicts[Math.min(reads++, conflicts.length - 1)] ?? [];
                if (answer instanceof Error) {
                    throw answer;
                }
                return answer;
            }
            return [];
        };
        const executor = {
            run: async (statement: unknown) => Promise.resolve().then(() => answer(statement))
        } as unknown as SchemaExecutor;
        const dropped = () => ran.some((it: any) => it?.native === 'CONSTRAINT_DROP');
        const read = () => ran.filter((it) => typeof it === 'string' && it.includes('holders > 1'));
        return { constraints: new ConstraintManager(executor, FALKORDB_SCHEMA), ran, dropped, read };
    }

    it('should wait for the constraint to be built', async () => {
        expect(await falkorDb('OPERATIONAL', 2).constraints.ensure(spec, 0)).toEqual({ status: 'CREATED', spec });
    });

    it('should not take a constraint listed UNDER CONSTRUCTION for built, as its build may yet fail', async () => {
        let listings = 0;
        const executor = {
            run: async (statement: any) =>
                Promise.resolve().then(() => {
                    if (statement === FALKORDB_SCHEMA.listUniques.statement) {
                        // Absent before it is made, then built for two listings, then FAILED.
                        const status = listings++ === 0 ? undefined : listings <= 4 ? 'UNDER CONSTRUCTION' : 'FAILED';
                        return status ? [{ label: 'Person', properties: ['email'], status }] : [];
                    }
                    return typeof statement === 'string' && statement.includes('holders > 1') ? [repeated] : [];
                })
        } as unknown as SchemaExecutor;
        expect(await new ConstraintManager(executor, FALKORDB_SCHEMA).ensure(spec, 0)).toEqual({
            status: 'VIOLATION',
            spec,
            sample: []
        });
    });

    it('should read the statuses of an attempt from one listing, so a build failing between readings is not built', async () => {
        let listings = 0;
        const executor = {
            run: async (statement: any) =>
                Promise.resolve().then(() => {
                    if (statement === FALKORDB_SCHEMA.listUniques.statement) {
                        // Absent before it is made, then UNDER CONSTRUCTION twice, then FAILED.
                        const status = listings++ === 0 ? undefined : listings <= 3 ? 'UNDER CONSTRUCTION' : 'FAILED';
                        return status ? [{ label: 'Person', properties: ['email'], status }] : [];
                    }
                    return typeof statement === 'string' && statement.includes('holders > 1') ? [repeated] : [];
                })
        } as unknown as SchemaExecutor;
        expect(await new ConstraintManager(executor, FALKORDB_SCHEMA).ensure(spec, 0)).toEqual({
            status: 'VIOLATION',
            spec,
            sample: []
        });
        // ensure's own check, then one listing per attempt: two UNDER CONSTRUCTION, one FAILED.
        expect(listings).toBe(4);
    });

    it('should drop a constraint whose build failed, and give a VIOLATION with an empty sample at sample size 0', async () => {
        const store = falkorDb('FAILED', 1, [repeated]);
        const started = Date.now();
        expect(await store.constraints.ensure(spec, 0)).toEqual({ status: 'VIOLATION', spec, sample: [] });
        expect(Date.now() - started).toBeLessThan(1_000);
        expect(store.dropped()).toBe(true);
        // The data is read only after the build failed, to confirm the violation, for one key.
        expect(store.read()).toEqual([FALKORDB_SCHEMA.conflicts(spec, 1)]);
    });

    it('should give the keys held more than once, up to the sample size, when the build fails after the data was read', async () => {
        // Clean when ensure reads it first; two keys held more than once by the time the build fails.
        const store = falkorDb('FAILED', 1, [], [repeated, other]);
        expect(await store.constraints.ensure(spec, 2)).toEqual({
            status: 'VIOLATION',
            spec,
            sample: [repeated, other]
        });
        expect(store.dropped()).toBe(true);
        expect(store.read()).toEqual([FALKORDB_SCHEMA.conflicts(spec, 2), FALKORDB_SCHEMA.conflicts(spec, 2)]);
    });

    it('should drop a constraint whose build failed, and throw when no key is held more than once', async () => {
        const store = falkorDb('FAILED', 1, []);
        await expect(store.constraints.ensure(spec, 0)).rejects.toThrow(
            'FalkorDB could not build the uniqueness constraint on Person(email), but no key it covers is held more than once.'
        );
        expect(store.dropped()).toBe(true);
    });

    it('should drop a constraint whose build failed, and throw, keeping why, when the data cannot be read', async () => {
        const unreadable = new Error('Connection lost');
        const store = falkorDb('FAILED', 1, unreadable);
        const thrown = await store.constraints.ensure(spec, 0).catch((e) => e);
        expect(thrown).toBeInstanceOf(DrivineError);
        expect(thrown.message).toBe(
            'FalkorDB could not build the uniqueness constraint on Person(email), and the data could not be read to see why.'
        );
        expect(thrown.rootCause).toBe(unreadable);
        expect(store.dropped()).toBe(true);
    });

    /**
     * A FalkorDB holding a constraint another process is building. Until it is dropped, each listing gives the next of
     * `builds`, the last from then on; undefined lists nothing, as when that process has dropped its failed build. Once
     * dropped, nothing is listed until the constraint is made, and then each listing gives the next of `rebuilds`. The
     * query for keys held more than once gives `conflicts`.
     */
    function buildingInStore(
        builds: (string | undefined)[],
        rebuilds: string[] = ['OPERATIONAL'],
        conflicts: unknown[] = []
    ) {
        const ran: unknown[] = [];
        let phase: 'building' | 'dropped' | 'made' = 'building';
        let listings = 0;
        const listed = (status: string | undefined) =>
            status ? [{ label: 'Person', properties: ['email'], status }] : [];
        const answer = (statement: any): unknown[] => {
            ran.push(statement);
            if (statement?.native === 'CONSTRAINT_DROP') {
                phase = 'dropped';
                return [];
            }
            if (statement?.native === 'CONSTRAINT_CREATE') {
                phase = 'made';
                listings = 0;
                return [];
            }
            if (statement === FALKORDB_SCHEMA.listUniques.statement) {
                if (phase === 'building') {
                    return listed(builds[Math.min(listings++, builds.length - 1)]);
                }
                return phase === 'made' ? listed(rebuilds[Math.min(listings++, rebuilds.length - 1)]) : [];
            }
            return typeof statement === 'string' && statement.includes('holders > 1') ? conflicts : [];
        };
        const executor = {
            run: async (statement: unknown) => Promise.resolve().then(() => answer(statement))
        } as unknown as SchemaExecutor;
        const count = (native: string) => ran.filter((it: any) => it?.native === native).length;
        const listingsRun = () => ran.filter((it) => it === FALKORDB_SCHEMA.listUniques.statement).length;
        return { constraints: new ConstraintManager(executor, FALKORDB_SCHEMA), ran, count, listings: listingsRun };
    }

    it('should wait on a constraint already UNDER CONSTRUCTION, and match it once built', async () => {
        const store = buildingInStore(['UNDER CONSTRUCTION', 'UNDER CONSTRUCTION', 'OPERATIONAL']);
        expect(await store.constraints.ensure(spec)).toEqual({ status: 'ALREADY_MATCHING', spec });
        expect(store.listings()).toBe(3);
        expect([store.count('CONSTRAINT_DROP'), store.count('CONSTRAINT_CREATE')]).toEqual([0, 0]);
    });

    it('should drop a constraint already UNDER CONSTRUCTION whose build fails, and give a VIOLATION from the data', async () => {
        const store = buildingInStore(['UNDER CONSTRUCTION', 'FAILED'], ['FAILED'], [repeated]);
        expect(await store.constraints.ensure(spec)).toEqual({ status: 'VIOLATION', spec, sample: [repeated] });
        // Dropped, and not made again over data that holds a key more than once.
        expect([store.count('CONSTRAINT_DROP'), store.count('CONSTRAINT_CREATE')]).toEqual([1, 0]);
    });

    it('should drop a constraint already UNDER CONSTRUCTION whose build fails, and make it again once the data is clean', async () => {
        const store = buildingInStore(['UNDER CONSTRUCTION', 'FAILED']);
        expect(await store.constraints.ensure(spec)).toEqual({ status: 'CREATED', spec });
        const dropped = store.ran.findIndex((it: any) => it?.native === 'CONSTRAINT_DROP');
        expect(dropped).toBeGreaterThanOrEqual(0);
        expect(store.ran.slice(dropped).some((it: any) => it?.native === 'CONSTRAINT_CREATE')).toBe(true);
    });

    it('should drop a constraint already marked FAILED, and give a VIOLATION at sample size 0 when its rebuild fails', async () => {
        const store = buildingInStore(['FAILED'], ['FAILED'], [repeated]);
        expect(await store.constraints.ensure(spec, 0)).toEqual({ status: 'VIOLATION', spec, sample: [] });
        // The one already there, then the one made again, which failed too.
        expect(store.count('CONSTRAINT_DROP')).toBe(2);
    });

    it('should make a constraint dropped while it was UNDER CONSTRUCTION', async () => {
        const store = buildingInStore(['UNDER CONSTRUCTION', undefined]);
        expect(await store.constraints.ensure(spec)).toEqual({ status: 'CREATED', spec });
        expect([store.count('CONSTRAINT_DROP'), store.count('CONSTRAINT_CREATE')]).toEqual([0, 1]);
    });

    it('should throw, leaving it, when a constraint already UNDER CONSTRUCTION is still being built at the limit', async () => {
        jest.useFakeTimers();
        try {
            const store = buildingInStore(['UNDER CONSTRUCTION']);
            const ensured = store.constraints.ensure(spec).catch((e) => e);
            await jest.advanceTimersByTimeAsync(60_000);
            const thrown = await ensured;
            expect(thrown).toBeInstanceOf(DrivineError);
            expect(thrown.message).toBe('The uniqueness constraint on Person(email) was not built.');
            expect([store.count('CONSTRAINT_DROP'), store.count('CONSTRAINT_CREATE')]).toEqual([0, 0]);
        } finally {
            jest.useRealTimers();
        }
    });

    /** What FalkorDB says to a drop of a constraint that isn't there. */
    const noSuchConstraint = new Error('Unable to drop constraint, no such constraint.');

    /**
     * A FalkorDB whose constraint is listed with each of `builds` in turn, the last from then on, until another
     * process also waiting on it drops it first: the drop here is refused, and nothing is listed until the constraint
     * is made, after which it is listed OPERATIONAL. With `madeHere`, nothing is listed until it is made here, and the
     * listing of `builds` follows. The query for keys held more than once gives `conflicts`.
     */
    function droppedFirstElsewhere(builds: string[], madeHere: boolean = false, conflicts: unknown[] = []) {
        const ran: unknown[] = [];
        let phase: 'none' | 'building' | 'dropped' | 'made' = madeHere ? 'none' : 'building';
        let listings = 0;
        const answer = (statement: any): unknown[] => {
            ran.push(statement);
            if (statement?.native === 'CONSTRAINT_DROP') {
                phase = 'dropped';
                throw noSuchConstraint;
            }
            if (statement?.native === 'CONSTRAINT_CREATE') {
                phase = phase === 'none' ? 'building' : 'made';
                return [];
            }
            if (statement === FALKORDB_SCHEMA.listUniques.statement) {
                const status =
                    phase === 'building'
                        ? builds[Math.min(listings++, builds.length - 1)]
                        : phase === 'made'
                        ? 'OPERATIONAL'
                        : undefined;
                return status ? [{ label: 'Person', properties: ['email'], status }] : [];
            }
            return typeof statement === 'string' && statement.includes('holders > 1') ? conflicts : [];
        };
        const executor = {
            run: async (statement: unknown) => Promise.resolve().then(() => answer(statement))
        } as unknown as SchemaExecutor;
        const count = (native: string) => ran.filter((it: any) => it?.native === native).length;
        return { constraints: new ConstraintManager(executor, FALKORDB_SCHEMA), count };
    }

    it('should make again a failed build another process dropped first', async () => {
        const store = droppedFirstElsewhere(['UNDER CONSTRUCTION', 'FAILED']);
        expect(await store.constraints.ensure(spec)).toEqual({ status: 'CREATED', spec });
        expect(store.count('CONSTRAINT_CREATE')).toBe(1);
    });

    it('should give a VIOLATION for a failed build made here that another process dropped first', async () => {
        const store = droppedFirstElsewhere(['UNDER CONSTRUCTION', 'FAILED'], true, [repeated]);
        expect(await store.constraints.ensure(spec, 0)).toEqual({ status: 'VIOLATION', spec, sample: [] });
    });

    it('should throw a refused drop of a failed build while it is still listed', async () => {
        const executor = {
            run: async (statement: any) =>
                Promise.resolve().then(() => {
                    if (statement?.native === 'CONSTRAINT_DROP') {
                        throw noSuchConstraint;
                    }
                    if (statement?.native === 'CONSTRAINT_CREATE') {
                        throw new Error('made');
                    }
                    return statement === FALKORDB_SCHEMA.listUniques.statement
                        ? [{ label: 'Person', properties: ['email'], status: 'FAILED' }]
                        : [];
                })
        } as unknown as SchemaExecutor;
        await expect(new ConstraintManager(executor, FALKORDB_SCHEMA).ensure(spec)).rejects.toBe(noSuchConstraint);
    });

    it('should drop a constraint whose build failed, which list leaves out', async () => {
        const ran: unknown[] = [];
        const executor = {
            run: async (statement: unknown) => {
                ran.push(statement);
                return Promise.resolve(
                    statement === FALKORDB_SCHEMA.listUniques.statement
                        ? [{ label: 'Person', properties: ['email'], status: 'FAILED' }]
                        : []
                );
            }
        } as unknown as SchemaExecutor;
        const constraints = new ConstraintManager(executor, FALKORDB_SCHEMA);
        expect(await constraints.list()).toEqual([]);
        await constraints.drop(spec);
        expect(ran).toContainEqual({ native: 'CONSTRAINT_DROP', label: 'Person', properties: ['email'] });
    });
});

describe("Neo4j's schema grammar", () => {
    it('should know an index in the way of a constraint by its code, not by a name clash or by prose', () => {
        expect(NEO4J_SCHEMA.blockedByIndex!(DrivineError.withRootCause(inTheWay()))).toBe(true);
        expect(NEO4J_SCHEMA.blockedByIndex!({ rootCause: { cause: inTheWay() } })).toBe(true);
        expect(
            NEO4J_SCHEMA.blockedByIndex!(
                Object.assign(new Error("There already exists an index called 'person_email'."), {
                    code: 'Neo.ClientError.Schema.IndexWithNameAlreadyExists'
                })
            )
        ).toBe(false);
        expect(NEO4J_SCHEMA.blockedByIndex!(new Error('There already exists an index (:Person {email}).'))).toBe(false);
        expect(NEO4J_SCHEMA.blockedByIndex!(undefined)).toBe(false);
    });

    it('should drop a range index by the name the engine gives it, quoted', () => {
        expect(NEO4J_SCHEMA.dropRange({ kind: 'RANGE', label: 'Person', properties: ['email'] }, 'my`index')).toEqual([
            'DROP INDEX `my``index` IF EXISTS'
        ]);
        expect(NEO4J_SCHEMA.dropRange({ kind: 'RANGE', label: 'Person', properties: ['email'] })).toEqual([
            'DROP INDEX Person_email_range IF EXISTS'
        ]);
    });
});

describe("The store key's constraint", () => {
    afterEach(() => jest.restoreAllMocks());

    it('should not be in force, and be warned of, with an index in the way of it', async () => {
        const warn = jest.spyOn(DrivineLogger.prototype, 'warn').mockImplementation(() => undefined);
        const blocked = {
            ensure: async (spec: unknown) =>
                Promise.resolve({
                    status: 'BLOCKED_BY_INDEX',
                    spec,
                    index: { label: 'DrivineStore', properties: ['key'], name: 'hand_made' }
                })
        } as unknown as ConstraintManager;
        const persistenceManager = { database: 'neo4j' } as unknown as PersistenceManager;
        const resolver = new StoreIdentityResolver(persistenceManager, {} as GraphBackend, blocked);

        const guarded = await (resolver as unknown as { ensureUniqueKey(): Promise<boolean> }).ensureUniqueKey();

        // As drivine4j's StoreIdentityResolver: best-effort until the index is dropped.
        expect(guarded).toBe(false);
        const warned = warn.mock.calls.map(([message]) => String(message)).join('\n');
        expect(warned).toContain('hand_made');
        expect(warned).toContain('in the way');
        expect(warned).toContain('neo4j');
    });
});
