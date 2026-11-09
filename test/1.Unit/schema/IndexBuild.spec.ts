import {
    ConnectionProvider,
    ConstraintManager,
    DatabaseRegistry,
    DatabaseType,
    DrivineError,
    GraphObjectManagerFactory,
    FALKORDB_SCHEMA,
    IndexManager,
    MEMGRAPH_SCHEMA,
    NEO4J_SCHEMA,
    rangeIndex,
    SchemaCatalog,
    SchemaExecutor,
    SchemaGrammar,
    SchemaManager,
    uniquenessConstraint
} from '@liberation-data/drivine';
import { DrivineLogger } from '@/logger';

/**
 * A store that holds no index until one is made, and then reports its build as each of `states` in turn, the last one
 * from then on: a Neo4j state (ONLINE, POPULATING, FAILED, failed with `failure`), or a FalkorDB status, where an
 * undefined one is the label not listed yet. `held` names a range index over Person(email) the store holds already, as
 * another process made it.
 */
interface Store {
    executor: SchemaExecutor;
    ran: { statement: string; bindings: Record<string, any> }[];
}

function store(states: (string | undefined)[], options: { failure?: string; held?: string } = {}): Store {
    const ran: { statement: string; bindings: Record<string, any> }[] = [];
    let made = !!options.held;
    let read = 0;
    const answer = (statement: string, bindings: Record<string, any>): unknown[] => {
        ran.push({ statement, bindings });
        if (statement.startsWith('CREATE')) {
            made = true;
            return [];
        }
        if (statement === NEO4J_SCHEMA.indexBuild!.statement || statement === FALKORDB_SCHEMA.indexBuild!.statement) {
            const state = states[Math.min(read++, states.length - 1)];
            if (!made || state === undefined) {
                return [];
            }
            return statement.includes('failureMessage')
                ? [{ state, failureMessage: options.failure ?? '' }]
                : [{ status: state }];
        }
        if (options.held && statement.includes("type = 'RANGE'")) {
            return [{ name: options.held, labels: ['Person'], properties: ['email'] }];
        }
        if (statement.startsWith('SHOW CONSTRAINTS')) {
            return made ? [{ name: 'Person_email_unique', labels: ['Person'], properties: ['email'] }] : [];
        }
        return [];
    };
    const executor = {
        run: async (statement: string, bindings: Record<string, any> = {}) =>
            Promise.resolve().then(() => answer(statement, bindings))
    } as unknown as SchemaExecutor;
    return { executor, ran };
}

const builds = (ran: Store['ran'], grammar: SchemaGrammar): Store['ran'] =>
    ran.filter((it) => it.statement === grammar.indexBuild!.statement);

describe('An index made on an engine that builds it in the background', () => {
    const spec = rangeIndex('Person', 'email');
    let warn: jest.SpyInstance;

    beforeEach(() => {
        warn = jest.spyOn(DrivineLogger.prototype, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => warn.mockRestore());

    it('should be read by its name, after it is made, until it is ONLINE, on Neo4j', async () => {
        const { executor, ran }: Store = store(['POPULATING', 'ONLINE']);
        expect((await new IndexManager(executor, NEO4J_SCHEMA).ensure(spec)).status).toEqual('CREATED');
        const created = ran.findIndex((it) => it.statement.startsWith('CREATE INDEX'));
        const read = builds(ran, NEO4J_SCHEMA);
        expect(created).toBeGreaterThanOrEqual(0);
        expect(ran.indexOf(read[0])).toBeGreaterThan(created);
        expect(read.map((it) => it.bindings)).toEqual([
            { name: 'Person_email_range', label: 'Person' },
            { name: 'Person_email_range', label: 'Person' }
        ]);
    });

    it("should throw, naming the index and Neo4j's reason, when its build failed", async () => {
        const { executor }: Store = store(['FAILED'], { failure: 'Property value is too large to index.' });
        const made = new IndexManager(executor, NEO4J_SCHEMA).ensure(spec);
        await expect(made).rejects.toThrow(DrivineError);
        await expect(made).rejects.toThrow(
            'Neo4j failed to build the RANGE index Person_email_range on Person(email): Property value is too large ' +
                'to index. Drop it'
        );
    });

    it('should log a failed build under WARN, and carry on', async () => {
        const { executor }: Store = store(['FAILED'], { failure: 'Property value is too large to index.' });
        const result = await new IndexManager(executor, NEO4J_SCHEMA).withBuild({ mode: 'WARN' }).ensure(spec);
        expect(result.status).toEqual('CREATED');
        expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Person_email_range.*too large to index/));
    });

    it('should throw, naming the index and its state, when it is not built in time, or log it under WARN', async () => {
        const { executor }: Store = store(['POPULATING']);
        await expect(new IndexManager(executor, NEO4J_SCHEMA).withBuild({ timeout: 5 }).ensure(spec)).rejects.toThrow(
            'Neo4j had not built the RANGE index Person_email_range on Person(email) after 5 ms: it is POPULATING'
        );
        const warned = await new IndexManager(store(['POPULATING']).executor, NEO4J_SCHEMA)
            .withBuild({ timeout: 5, mode: 'WARN' })
            .ensure(spec);
        expect(warned.status).toEqual('CREATED');
        expect(warn).toHaveBeenCalledWith(expect.stringMatching(/had not built .* after 5 ms: it is POPULATING/));
    });

    it('should be waited for, by its name, when recreate makes it again', async () => {
        const { executor, ran }: Store = store(['POPULATING', 'FAILED'], { held: 'theirs' });
        await expect(new IndexManager(executor, NEO4J_SCHEMA).recreate(spec)).rejects.toThrow(
            'Neo4j failed to build the RANGE index Person_email_range on Person(email)'
        );
        expect(builds(ran, NEO4J_SCHEMA).map((it) => it.bindings.name)).toEqual([
            'Person_email_range',
            'Person_email_range'
        ]);
    });

    it('should wait, by its own name, for a matching index another process made, which may still be building', async () => {
        const { executor, ran }: Store = store(['POPULATING', 'ONLINE'], { held: 'theirs' });
        expect((await new IndexManager(executor, NEO4J_SCHEMA).ensure(spec)).status).toEqual('ALREADY_MATCHING');
        expect(builds(ran, NEO4J_SCHEMA).map((it) => it.bindings.name)).toEqual(['theirs', 'theirs']);
    });

    it('should throw for a matching index another process made whose build failed, naming it', async () => {
        const { executor }: Store = store(['FAILED'], {
            held: 'theirs',
            failure: 'Property value is too large to index.'
        });
        await expect(new IndexManager(executor, NEO4J_SCHEMA).ensure(spec)).rejects.toThrow(
            'Neo4j failed to build the RANGE index theirs on Person(email): Property value is too large to index.'
        );
    });

    it('should not wait for a Neo4j constraint, whose CREATE CONSTRAINT returns once its index is ONLINE', async () => {
        const { executor, ran }: Store = store(['POPULATING']);
        const result = await new ConstraintManager(executor, NEO4J_SCHEMA).ensure(
            uniquenessConstraint('Person', 'email'),
            0
        );
        expect(result.status).toEqual('CREATED');
        expect(builds(ran, NEO4J_SCHEMA)).toEqual([]);
    });

    it('should be read by its label on FalkorDB, until it is listed and OPERATIONAL', async () => {
        const { executor, ran }: Store = store([undefined, '[Indexing] 0/20000: UNDER CONSTRUCTION', 'OPERATIONAL']);
        expect((await new IndexManager(executor, FALKORDB_SCHEMA).ensure(spec)).status).toEqual('CREATED');
        expect(builds(ran, FALKORDB_SCHEMA).map((it) => it.bindings.label)).toEqual(['Person', 'Person', 'Person']);
    });

    it('should throw for a FalkorDB build that failed, or one still under construction after the timeout', async () => {
        await expect(new IndexManager(store(['FAILED']).executor, FALKORDB_SCHEMA).ensure(spec)).rejects.toThrow(
            'FalkorDB failed to build the RANGE index Person_email_range on Person(email): FAILED. Drop it'
        );
        const building = store(['[Indexing] 0/20000: UNDER CONSTRUCTION']).executor;
        await expect(
            new IndexManager(building, FALKORDB_SCHEMA).withBuild({ timeout: 5 }).ensure(spec)
        ).rejects.toThrow('after 5 ms: it is [Indexing] 0/20000: UNDER CONSTRUCTION');
    });

    it('should wait for the range index a FalkorDB constraint needs first, as its build options say', async () => {
        const building = store(['[Indexing] 0/20000: UNDER CONSTRUCTION']).executor;
        await expect(
            new ConstraintManager(building, FALKORDB_SCHEMA)
                .withBuild({ timeout: 5 })
                .ensure(uniquenessConstraint('Person', 'email'), 0)
        ).rejects.toThrow('FalkorDB had not built the RANGE index Person_email_range');
    });

    it('should not be waited for on Memgraph, which builds it inside its CREATE INDEX', async () => {
        expect(MEMGRAPH_SCHEMA.indexBuild).toBeUndefined();
        const { executor, ran }: Store = store(['POPULATING']);
        await new IndexManager(executor, MEMGRAPH_SCHEMA).ensure(spec);
        expect(ran.some((it) => it.statement.includes('SHOW INDEXES YIELD name, state'))).toBe(false);
    });
});

describe('SchemaManager applying an owner one of whose indexes is not built', () => {
    let warn: jest.SpyInstance;

    /**
     * A Neo4j database `a` where every index made reports its build as `state`, and whose marker writes are collected
     * in `recorded`.
     */
    interface Managed {
        schema: SchemaManager;
        ran: Store['ran'];
        recorded: unknown[];
    }

    function manager(state: string, mode?: 'WARN'): Managed {
        const { executor, ran }: Store = store([state], { failure: 'Property value is too large to index.' });
        const recorded: unknown[] = [];
        const gom = {
            indexes: new IndexManager(executor, NEO4J_SCHEMA),
            constraints: new ConstraintManager(executor, NEO4J_SCHEMA),
            persistenceManager: {
                maybeGetOne: async () => Promise.resolve(null),
                execute: async (it: unknown) => Promise.resolve(void recorded.push(it))
            },
            backend: {
                schemaMarker: () => ({ spec: () => ({}) }),
                markerItems: () => undefined,
                recordSchemaMarker: () => ({ spec: (it: unknown) => it })
            }
        };
        const factory = { get: () => gom } as unknown as GraphObjectManagerFactory;
        return { schema: new SchemaManager(factory, { catalogs: [], mode, indexBuildTimeout: 5 }), ran, recorded };
    }

    const made = (ran: Store['ran']): string[] =>
        ran.filter((it) => it.statement.startsWith('CREATE')).map((it) => it.statement);

    beforeEach(() => {
        DatabaseRegistry.tearDown();
        DatabaseRegistry.getInstance().register({ name: 'a', type: DatabaseType.NEO4J } as ConnectionProvider);
        warn = jest.spyOn(DrivineLogger.prototype, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => warn.mockRestore());
    afterAll(() => DatabaseRegistry.tearDown());

    it("should apply the owner's other items first under FAIL_FAST, then raise every one, leaving the marker", async () => {
        const { schema, ran, recorded }: Managed = manager('FAILED');
        const owner = SchemaCatalog.of(rangeIndex('Person', 'email'), rangeIndex('Person', 'name')).named('dice');

        await expect(schema.ensure(owner)).rejects.toThrow(
            new RegExp(
                "owner 'dice' on a found indexes not built:\\n" +
                    '  - BUILD FAILED: Neo4j failed to build the RANGE index Person_email_range .*\\n' +
                    '  - BUILD FAILED: Neo4j failed to build the RANGE index Person_name_range .*\\n' +
                    'Resolve them, set indexBuildTimeout longer'
            )
        );
        expect(made(ran)).toHaveLength(2);
        expect(recorded).toEqual([]);
    });

    it('should name an index still building as such, with the timeout to set', async () => {
        const { schema }: Managed = manager('POPULATING');
        await expect(schema.ensure('dice', rangeIndex('Person', 'email'))).rejects.toThrow(
            /STILL BUILDING: Neo4j had not built .* after 5 ms: it is POPULATING\. It is left to be built/
        );
    });

    it('should report each item as what was done under WARN, log it, and record the marker', async () => {
        const { schema, recorded }: Managed = manager('FAILED', 'WARN');
        const report = await schema.ensure('dice', rangeIndex('Person', 'email'));

        expect(report.get('a')!.map((it) => it.status)).toEqual(['CREATED']);
        expect(warn).toHaveBeenCalledWith(expect.stringMatching(/BUILD FAILED: .*Person_email_range.*too large/));
        expect(recorded).toHaveLength(1);
    });

    it('should collect the range index a FalkorDB constraint needs first, make the constraint, then raise it', async () => {
        DatabaseRegistry.tearDown();
        DatabaseRegistry.getInstance().register({ name: 'a', type: DatabaseType.FALKORDB } as ConnectionProvider);
        let constrained = false;
        const executor = {
            run: async (statement: any) =>
                Promise.resolve().then(() => {
                    if (statement?.native === 'CONSTRAINT_CREATE') {
                        constrained = true;
                    }
                    if (statement === FALKORDB_SCHEMA.indexBuild!.statement) {
                        return [{ status: '[Indexing] 0/20000: UNDER CONSTRUCTION' }];
                    }
                    return statement === FALKORDB_SCHEMA.listUniques.statement && constrained
                        ? [{ label: 'Person', properties: ['email'], status: 'OPERATIONAL' }]
                        : [];
                })
        } as unknown as SchemaExecutor;
        const recorded: unknown[] = [];
        const gom = {
            indexes: new IndexManager(executor, FALKORDB_SCHEMA),
            constraints: new ConstraintManager(executor, FALKORDB_SCHEMA),
            persistenceManager: {
                maybeGetOne: async () => Promise.resolve(null),
                execute: async (it: unknown) => Promise.resolve(void recorded.push(it))
            },
            backend: {
                schemaMarker: () => ({ spec: () => ({}) }),
                markerItems: () => undefined,
                recordSchemaMarker: () => ({ spec: (it: unknown) => it })
            }
        };
        const factory = { get: () => gom } as unknown as GraphObjectManagerFactory;
        const schema = new SchemaManager(factory, { catalogs: [], indexBuildTimeout: 5 });

        await expect(schema.ensure('dice', uniquenessConstraint('Person', 'email'))).rejects.toThrow(
            /STILL BUILDING: FalkorDB had not built the RANGE index Person_email_range .* after 5 ms/
        );
        expect(constrained).toBe(true);
        expect(recorded).toEqual([]);
    });
});

describe('An error reading the state of an index being built', () => {
    it('should be thrown as it is, under WARN too, not taken for a failed build', async () => {
        const lost = new Error('Connection lost');
        const executor = {
            run: async (statement: string) =>
                statement === NEO4J_SCHEMA.indexBuild!.statement ? Promise.reject(lost) : Promise.resolve([])
        } as unknown as SchemaExecutor;
        const unbuilt = jest.fn();
        const indexes = new IndexManager(executor, NEO4J_SCHEMA);
        await expect(indexes.withBuild({ mode: 'WARN' }).ensure(rangeIndex('Person', 'email'))).rejects.toBe(lost);
        await expect(indexes.withBuild({ unbuilt }).ensure(rangeIndex('Person', 'email'))).rejects.toBe(lost);
        expect(unbuilt).not.toHaveBeenCalled();
    });
});
