import {
    CypherBackend,
    cypherGrammarFor,
    DatabaseRegistry,
    DatabaseType,
    FALKORDB_SCHEMA,
    ModelRegistry,
    PersistenceManager,
    QuerySpecification,
    rangeIndex,
    SchemaExecutor,
    StatelessGraphObjectManager,
    uniquenessConstraint
} from '@liberation-data/drivine';
import { closeGraphEngines, graphEngines, persistenceManagerFor } from '../support/GraphEngines';

// Schema DDL on Neo4j waits on schema locks other suites hold while they run in parallel.
jest.setTimeout(30_000);

describe.each(graphEngines())('indexes and constraints on $type', (engine) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    const specs = {
        range: rangeIndex('SchemaRange', 'contextId'),
        composite: rangeIndex('SchemaRange', ['sessionId', 'createdAt']),
        unique: uniquenessConstraint('SchemaUnique', 'id'),
        compositeUnique: uniquenessConstraint('SchemaUnique2', ['tenantId', 'userId']),
        violated: uniquenessConstraint('SchemaDup', 'id'),
        failed: uniquenessConstraint('SchemaFailed', 'code')
    };

    const tidy = async (): Promise<void> => {
        await gom.constraints.drop(specs.unique);
        await gom.constraints.drop(specs.compositeUnique);
        await gom.constraints.drop(specs.violated);
        await gom.constraints.drop(specs.failed);
        await gom.indexes.drop(specs.range);
        await gom.indexes.drop(specs.composite);
        await gom.indexes.drop(rangeIndex(specs.failed.label, specs.failed.properties));
        await pm.execute(
            new QuerySpecification(
                'MATCH (n) WHERE n:SchemaUnique OR n:SchemaUnique2 OR n:SchemaDup OR n:SchemaFailed DETACH DELETE n'
            )
        );
    };

    beforeAll(async () => {
        pm = persistenceManagerFor(engine);
        gom = new StatelessGraphObjectManager(
            pm,
            new CypherBackend(cypherGrammarFor(engine.type)),
            new ModelRegistry()
        );
        await tidy();
    });

    afterAll(async () => {
        await tidy();
        await closeGraphEngines();
    });

    it('should make a range index once, single or composite', async () => {
        expect((await gom.indexes.ensure(specs.range)).status).toEqual('CREATED');
        expect((await gom.indexes.ensure(specs.range)).status).toEqual('ALREADY_MATCHING');
        expect((await gom.indexes.ensure(specs.composite)).status).toEqual('CREATED');
        expect((await gom.indexes.ensure(specs.composite)).status).toEqual('ALREADY_MATCHING');
        const listed = (await gom.indexes.list()).filter((it) => it.label === 'SchemaRange');
        expect(listed.some((it) => it.properties.includes('contextId'))).toBe(true);
    });

    it('should make a uniqueness constraint once, and the engine then refuses a duplicate', async () => {
        expect((await gom.constraints.ensure(specs.unique)).status).toEqual('CREATED');
        expect((await gom.constraints.ensure(specs.unique)).status).toEqual('ALREADY_MATCHING');
        await pm.execute(new QuerySpecification("CREATE (:SchemaUnique {id: 'a'})"));
        await expect(pm.execute(new QuerySpecification("CREATE (:SchemaUnique {id: 'a'})"))).rejects.toThrow();
        expect((await gom.constraints.ensure(specs.compositeUnique)).status).toEqual('CREATED');
    });

    it('should report a violation, with a sample, and make nothing, when the data already breaks it', async () => {
        await pm.execute(
            new QuerySpecification("CREATE (:SchemaDup {id: 'x'}), (:SchemaDup {id: 'x'}), (:SchemaDup {id: 'y'})")
        );
        const result = await gom.constraints.ensure(specs.violated);
        expect(result.status).toEqual('VIOLATION');
        expect(result.sample).toEqual([
            { properties: { id: 'x' }, count: 2, nodes: [expect.anything(), expect.anything()] }
        ]);
        expect((await gom.constraints.list()).some((it) => it.label === 'SchemaDup')).toBe(false);
    });

    it('should drop a constraint FalkorDB already marked FAILED, and make it again once the data is clean', async () => {
        if (engine.type !== DatabaseType.FALKORDB) {
            return;
        }
        const spec = specs.failed;
        const executor = new SchemaExecutor(DatabaseRegistry.getInstance().connectionProvider(pm.database)!);
        const failed = async (): Promise<boolean> =>
            FALKORDB_SCHEMA.listFailedUniques!.read(
                await executor.run(FALKORDB_SCHEMA.listFailedUniques!.statement)
            ).some((it) => it.label === spec.label);
        // A constraint whose build failed left in the store, as an earlier run, or a crash before its drop, would.
        const leaveFailed = async (): Promise<void> => {
            await gom.indexes.ensure(rangeIndex(spec.label, spec.properties));
            for (const statement of FALKORDB_SCHEMA.createUnique(spec)) {
                await executor.run(statement);
            }
            for (let attempt = 0; !(await failed()); attempt++) {
                expect(attempt).toBeLessThan(100);
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
        };
        await pm.execute(new QuerySpecification("CREATE (:SchemaFailed {code: 'c'}), (:SchemaFailed {code: 'c'})"));
        await leaveFailed();
        // The data still holds the key more than once: a VIOLATION, and the failed constraint gone.
        expect((await gom.constraints.ensure(spec)).status).toEqual('VIOLATION');
        expect(await failed()).toBe(false);

        // Once the data is clean, the constraint is made over the failed one, and enforced.
        await leaveFailed();
        await pm.execute(new QuerySpecification('MATCH (n:SchemaFailed) DETACH DELETE n'));
        await pm.execute(new QuerySpecification("CREATE (:SchemaFailed {code: 'c'})"));
        expect((await gom.constraints.ensure(spec)).status).toEqual('CREATED');
        expect(await failed()).toBe(false);
        await expect(pm.execute(new QuerySpecification("CREATE (:SchemaFailed {code: 'c'})"))).rejects.toThrow();
    });
});
