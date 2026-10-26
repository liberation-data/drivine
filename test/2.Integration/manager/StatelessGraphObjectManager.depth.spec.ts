import {
    CypherBackend,
    cypherGrammarFor,
    GraphRelationship,
    GraphView,
    ModelRegistry,
    NodeFragment,
    NodeId,
    NodeStamp,
    PersistenceManager,
    QuerySpecification,
    ReadOnly,
    Root,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';
import { closeGraphEngines, graphEngines, persistenceManagerFor } from '../support/GraphEngines';

// Neo4j plans each statement the first time it sees it, a few hundred milliseconds for one of the object manager's, and
// the tests here send statements of their own shapes. On fresh containers, beside the suites running in parallel, a
// test can pass Jest's 5 seconds planning them (#349).
jest.setTimeout(30_000);

@NodeFragment({ labels: ['DepthTest', 'Location'] })
class Location {
    @NodeId() id: string;
    @NodeStamp() stamp?: string;
}

@GraphView()
class LocationHierarchy {
    @Root() location: Location;
    @GraphRelationship({ type: 'HAS_LOCATION', target: () => LocationHierarchy, maxDepth: 2 })
    subLocations: LocationHierarchy[];
}

@GraphView()
class LocationWithDescendants {
    @Root() location: Location;
    @GraphRelationship({ type: 'HAS_LOCATION', target: () => Location, maxDepth: 3 })
    descendants: Location[];
    @ReadOnly() @GraphRelationship({ type: 'REVIEWED_BY', target: () => Location }) reviewers: Location[];
    @GraphRelationship({ type: 'TWINNED', target: () => Location }) twins: Location[];
}

const location = (id: string): Location => Object.assign(new Location(), { id });
const depthOf = (it: LocationHierarchy): number =>
    it.subLocations.length ? 1 + Math.max(...it.subLocations.map(depthOf)) : 0;

describe.each(graphEngines())('depth and read-only fields on $type', (engine) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    const edges = async (): Promise<string[]> =>
        pm.query<string>(
            new QuerySpecification(
                "MATCH (a:DepthTest)-[r]->(b:DepthTest) RETURN a.id + '-' + type(r) + '->' + b.id AS e ORDER BY e"
            )
        );

    beforeAll(() => {
        pm = persistenceManagerFor(engine);
        gom = new StatelessGraphObjectManager(
            pm,
            new CypherBackend(cypherGrammarFor(engine.type)),
            new ModelRegistry()
        );
    });

    beforeEach(async () => {
        await pm.execute(new QuerySpecification('MATCH (n:DepthTest) DETACH DELETE n'));
        // earth > europe > france > paris > louvre, and earth > france directly too.
        await pm.execute(
            new QuerySpecification(
                "CREATE (e:DepthTest:Location {id: 'earth'})-[:HAS_LOCATION]->(eu:DepthTest:Location {id: 'europe'})" +
                    "-[:HAS_LOCATION]->(f:DepthTest:Location {id: 'france'})-[:HAS_LOCATION]->(p:DepthTest:Location {id: 'paris'})" +
                    "-[:HAS_LOCATION]->(:DepthTest:Location {id: 'louvre'}), (e)-[:HAS_LOCATION]->(f), " +
                    "(e)-[:REVIEWED_BY]->(:DepthTest:Location {id: 'reviewer'})"
            )
        );
    });

    afterAll(async () => {
        await pm.execute(new QuerySpecification('MATCH (n:DepthTest) DETACH DELETE n'));
        await closeGraphEngines();
    });

    it('should follow a view that holds itself to maxDepth, or the depth a load asks for', async () => {
        expect(depthOf((await gom.load(LocationHierarchy, 'earth'))!)).toEqual(2);
        expect(depthOf((await gom.load(LocationHierarchy, 'earth', { depth: { subLocations: 4 } }))!)).toEqual(4);
        const all = await gom.loadAll(LocationHierarchy, {
            where: 'n.id = $id',
            bindings: { id: 'europe' },
            depth: { subLocations: 1 }
        });
        expect(all.map(depthOf)).toEqual([1]);
        await expect(gom.loadAll(LocationHierarchy, { depth: { subLocations: 0 } })).rejects.toThrow(/at least 1/);
    });

    it('should read a list of fragments over several hops, each node once', async () => {
        const loaded = (await gom.load(LocationWithDescendants, 'earth'))!;
        // louvre is three hops away through the direct earth > france relationship; france is reached two ways.
        expect(loaded.descendants.map((it) => it.id).sort()).toEqual(['europe', 'france', 'louvre', 'paris']);
        const nearer = (await gom.load(LocationWithDescendants, 'earth', { depth: { descendants: 1 } }))!;
        expect(nearer.descendants.map((it) => it.id).sort()).toEqual(['europe', 'france']);
        expect(loaded.reviewers.map((it) => it.id)).toEqual(['reviewer']);
    });

    it('should never write a read-only field, nor a list read over several hops', async () => {
        const before = await edges();
        await gom.save(
            Object.assign(new LocationWithDescendants(), {
                location: location('earth'),
                descendants: [location('mars')],
                reviewers: [location('critic')],
                twins: [location('moon')]
            })
        );
        expect(await edges()).toEqual([...before, 'earth-TWINNED->moon'].sort());
        expect(
            (await pm.query(new QuerySpecification("MATCH (n:DepthTest) WHERE n.id IN ['mars', 'critic'] RETURN n")))
                .length
        ).toEqual(0);
    });

    it('should refuse to replace a read-only field, and leave it out of replace all', async () => {
        await gom.save(location('earth'));
        const loaded = (await gom.load(LocationWithDescendants, 'earth'))!;
        await expect(gom.save(loaded, { replace: ['reviewers'] })).rejects.toThrow(/read-only/);
        loaded.reviewers = [];
        loaded.descendants = [];
        await gom.save(loaded, { replace: 'all' });
        expect(await edges()).toContain('earth-REVIEWED_BY->reviewer');
        expect(await edges()).toContain('earth-HAS_LOCATION->europe');
    });
});
