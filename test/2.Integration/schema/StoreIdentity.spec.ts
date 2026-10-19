import {
    CypherBackend,
    cypherGrammarFor,
    ModelRegistry,
    PersistenceManager,
    QuerySpecification,
    StatelessGraphObjectManager,
    uniquenessConstraint
} from '@liberation-data/drivine';
import { closeGraphEngines, graphEngines, persistenceManagerFor } from '../support/GraphEngines';

// Schema DDL on Neo4j waits on schema locks other suites hold while they run in parallel.
jest.setTimeout(30_000);

describe.each(graphEngines())('store identity on $type', (engine) => {
    let pm: PersistenceManager;
    const manager = (): StatelessGraphObjectManager =>
        new StatelessGraphObjectManager(pm, new CypherBackend(cypherGrammarFor(engine.type)), new ModelRegistry());
    const wipe = async (): Promise<void> => {
        await pm.execute(new QuerySpecification('MATCH (s:DrivineStore) DETACH DELETE s'));
    };

    beforeAll(async () => {
        pm = persistenceManagerFor(engine);
        await manager().constraints.drop(uniquenessConstraint('DrivineStore', 'key'));
        await wipe();
    });

    afterAll(async () => {
        await wipe();
        await manager().constraints.drop(uniquenessConstraint('DrivineStore', 'key'));
        await closeGraphEngines();
    });

    it('should mint an identity once, and report the same one again', async () => {
        const first = await manager().storeIdentity();
        expect(first.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(first.engine).toEqual(engine.type);
        expect((await manager().storeIdentity()).id).toEqual(first.id);
    });

    it('should agree on one identity when several managers resolve a virgin store at once', async () => {
        await wipe();
        const ids = await Promise.all([1, 2, 3, 4, 5].map(async () => (await manager().storeIdentity()).id));
        expect(new Set(ids).size).toEqual(1);
        expect((await pm.query(new QuerySpecification('MATCH (s:DrivineStore) RETURN s.storeId'))).length).toEqual(1);
    });

    it('should mint a new identity for a store whose stamp is gone, as for new data', async () => {
        const before = (await manager().storeIdentity()).id;
        await wipe();
        expect((await manager().storeIdentity()).id).not.toEqual(before);
    });
});
