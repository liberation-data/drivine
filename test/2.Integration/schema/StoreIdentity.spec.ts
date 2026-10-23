import {
    CypherBackend,
    cypherGrammarFor,
    DatabaseType,
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

    it("should replace a plain index on the key in the way of its constraint, the label being Drivine's", async () => {
        if (engine.type !== DatabaseType.NEO4J) {
            return;
        }
        const constraints = manager().constraints;
        await constraints.drop(uniquenessConstraint('DrivineStore', 'key'));
        await wipe();
        await pm.execute(new QuerySpecification('CREATE INDEX store_key_lookup FOR (n:DrivineStore) ON (n.key)'));

        expect((await manager().storeIdentity()).id).toMatch(/^[0-9a-f-]{36}$/);
        expect((await constraints.list()).some((it) => it.label === 'DrivineStore')).toBe(true);
        expect((await manager().indexes.list('RANGE')).some((it) => it.name === 'store_key_lookup')).toBe(false);
    });

    it('should mint a new identity for a store whose stamp is gone, as for new data', async () => {
        const before = (await manager().storeIdentity()).id;
        await wipe();
        expect((await manager().storeIdentity()).id).not.toEqual(before);
    });
});
