import {
    ConstraintManager,
    DrivineError,
    FALKORDB_SCHEMA,
    IndexManager,
    MEMGRAPH_SCHEMA,
    NEO4J_SCHEMA,
    rangeIndex,
    SchemaExecutor,
    SchemaGrammar,
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
