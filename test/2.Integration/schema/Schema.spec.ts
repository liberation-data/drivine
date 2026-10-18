import {
    CypherBackend,
    cypherGrammarFor,
    ModelRegistry,
    PersistenceManager,
    QuerySpecification,
    rangeIndex,
    StatelessGraphObjectManager,
    uniquenessConstraint
} from '@liberation-data/drivine';
import { closeGraphEngines, graphEngines, persistenceManagerFor } from '../support/GraphEngines';

describe.each(graphEngines())('indexes and constraints on $type', (engine) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    const specs = {
        range: rangeIndex('SchemaRange', 'contextId'),
        composite: rangeIndex('SchemaRange', ['sessionId', 'createdAt']),
        unique: uniquenessConstraint('SchemaUnique', 'id'),
        compositeUnique: uniquenessConstraint('SchemaUnique2', ['tenantId', 'userId']),
        violated: uniquenessConstraint('SchemaDup', 'id')
    };

    const tidy = async (): Promise<void> => {
        await gom.constraints.drop(specs.unique);
        await gom.constraints.drop(specs.compositeUnique);
        await gom.constraints.drop(specs.violated);
        await gom.indexes.drop(specs.range);
        await gom.indexes.drop(specs.composite);
        await pm.execute(
            new QuerySpecification('MATCH (n) WHERE n:SchemaUnique OR n:SchemaUnique2 OR n:SchemaDup DETACH DELETE n')
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
        expect(result.sample).toEqual(['x']);
        expect((await gom.constraints.list()).some((it) => it.label === 'SchemaDup')).toBe(false);
    });
});
