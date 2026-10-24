import {
    ConstraintManager,
    DrivineError,
    FALKORDB_SCHEMA,
    NEO4J_SCHEMA,
    SchemaExecutor,
    uniquenessConstraint
} from '@liberation-data/drivine';

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
