import {
    CypherBackend,
    cypherGrammarFor,
    GraphProperty,
    ModelRegistry,
    NodeFragment,
    NodeId,
    PersistenceManager,
    QuerySpecification
} from '@liberation-data/drivine';
import { closeGraphEngines, graphEngines, persistenceManagerFor } from '../support/GraphEngines';

@NodeFragment({ labels: ['BackendTest', 'Odd Label'] })
class Hero {
    @NodeId() @GraphProperty('hero_id') id: string;
    name: string;
}

describe.each(graphEngines())('CypherBackend on $type', (engine) => {
    let pm: PersistenceManager;
    let backend: CypherBackend;
    const model = new ModelRegistry().fragment(Hero);

    beforeAll(async () => {
        pm = persistenceManagerFor(engine);
        backend = new CypherBackend(cypherGrammarFor(engine.type));
        await pm.execute(new QuerySpecification('MATCH (n:BackendTest) DETACH DELETE n'));
        await pm.execute(
            new QuerySpecification(
                "CREATE (:BackendTest:`Odd Label` {hero_id: 'h1', name: 'Moon Girl', labels: 'not the labels'}), " +
                    "(:BackendTest:`Odd Label` {hero_id: 'h2', name: 'Devil Dinosaur'}), " +
                    "(:BackendTest {hero_id: 'h3', name: 'Missing a label'})"
            )
        );
    });

    afterAll(async () => {
        await pm.execute(new QuerySpecification('MATCH (n:BackendTest) DETACH DELETE n'));
        await closeGraphEngines();
    });

    it('should load every node with all of the fragment labels, as props and labels', async () => {
        const rows: any[] = await pm.query(backend.loadAllFragments(model).spec());
        const byId = new Map(rows.map((it) => [it.props.hero_id, it]));
        expect([...byId.keys()].sort()).toEqual(['h1', 'h2']);
        expect(byId.get('h1').props).toEqual({ hero_id: 'h1', name: 'Moon Girl', labels: 'not the labels' });
        expect([...byId.get('h1').labels].sort()).toEqual(['BackendTest', 'Odd Label']);
    });

    it('should filter with a predicate over n', async () => {
        const rows: any[] = await pm.query(
            backend.loadAllFragments(model, 'n.name STARTS WITH $prefix').spec({ prefix: 'Devil' })
        );
        expect(rows.map((it) => it.props.name)).toEqual(['Devil Dinosaur']);
    });

    it('should load one node by its id, under its graph property name', async () => {
        const rows: any[] = await pm.query(backend.loadFragment(model).spec({ id: 'h2' }));
        expect(rows.map((it) => it.props.name)).toEqual(['Devil Dinosaur']);
        expect(await pm.query(backend.loadFragment(model).spec({ id: 'nobody' }))).toEqual([]);
    });

    it('should count, with and without a predicate', async () => {
        expect(await pm.getOne(backend.countFragments(model).spec())).toEqual(2);
        expect(await pm.getOne(backend.countFragments(model, "n.name = 'Moon Girl'").spec())).toEqual(1);
    });
});
