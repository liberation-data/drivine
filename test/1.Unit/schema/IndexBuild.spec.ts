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

/**
 * A store that holds no index until one is made, and then reports the made one in `state`, failed with `failure` when
 * FAILED. `awaited` is what db.awaitIndex does: nothing, or throw.
 */
interface Store {
    executor: SchemaExecutor;
    ran: { statement: string; bindings: Record<string, any> }[];
}

function store(state: string, options: { failure?: string; awaited?: Error } = {}): Store {
    const ran: { statement: string; bindings: Record<string, any> }[] = [];
    let made = false;
    const answer = (statement: string, bindings: Record<string, any>): unknown[] => {
        ran.push({ statement, bindings });
        if (statement.startsWith('CREATE')) {
            made = true;
            return [];
        }
        if (statement.startsWith('CALL db.awaitIndex(')) {
            if (options.awaited) {
                throw options.awaited;
            }
            return [];
        }
        if (statement.includes('failureMessage')) {
            return made ? [{ state, failureMessage: options.failure ?? '' }] : [];
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

describe('An index made on an engine that builds it in the background', () => {
    const spec = rangeIndex('Person', 'email');

    it('should be waited for by its name, after it is made, on Neo4j', async () => {
        const { executor, ran }: Store = store('ONLINE');
        expect((await new IndexManager(executor, NEO4J_SCHEMA).ensure(spec)).status).toEqual('CREATED');
        const created = ran.findIndex((it) => it.statement.startsWith('CREATE INDEX'));
        const awaited = ran.findIndex((it) => it.statement === 'CALL db.awaitIndex($name, 60)');
        expect(created).toBeGreaterThanOrEqual(0);
        expect(awaited).toBeGreaterThan(created);
        expect(ran[awaited].bindings).toEqual({ name: 'Person_email_range' });
    });

    it("should throw, naming the index and Neo4j's reason, when its build failed", async () => {
        const { executor }: Store = store('FAILED', {
            failure: 'Property value is too large to index.',
            awaited: new Error('Index `Person_email_range` has failed.')
        });
        const made = new IndexManager(executor, NEO4J_SCHEMA).ensure(spec);
        await expect(made).rejects.toThrow(DrivineError);
        await expect(made).rejects.toThrow(
            /Neo4j failed to build the index Person_email_range: Property value is too large to index\./
        );
    });

    it('should throw, naming the index and its state, when it is not built in time', async () => {
        const { executor }: Store = store('POPULATING', {
            awaited: new Error('Index population did not complete in time')
        });
        await expect(new IndexManager(executor, NEO4J_SCHEMA).ensure(spec)).rejects.toThrow(
            /Neo4j had not built the index Person_email_range after 60 s \(it is POPULATING\)/
        );
    });

    it('should wait for the index Neo4j builds for a uniqueness constraint, named as it is', async () => {
        const { executor, ran }: Store = store('ONLINE');
        const result = await new ConstraintManager(executor, NEO4J_SCHEMA).ensure(
            uniquenessConstraint('Person', 'email'),
            0
        );
        expect(result.status).toEqual('CREATED');
        const awaited = ran.filter((it) => it.statement.startsWith('CALL db.awaitIndex('));
        expect(awaited.map((it) => it.bindings)).toEqual([{ name: 'Person_email_unique' }]);
    });

    it.each([
        ['Memgraph', MEMGRAPH_SCHEMA],
        ['FalkorDB', FALKORDB_SCHEMA]
    ] as [string, SchemaGrammar][])(
        'should not be waited for on %s, where no write can fail on an index being built',
        async (_, grammar) => {
            expect(grammar.awaitIndex).toBeUndefined();
            const { executor, ran }: Store = store('ONLINE');
            await new IndexManager(executor, grammar).ensure(spec);
            expect(ran.some((it) => it.statement.includes('awaitIndex'))).toBe(false);
        }
    );
});
