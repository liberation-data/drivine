import {
    backendFor,
    DatabaseType,
    Direction,
    GraphRelationship,
    GraphView,
    ModelRegistry,
    NodeFragment,
    NodeId,
    PersistenceManager,
    PostgresGraph,
    QuerySpecification,
    Root,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';
import { allStores, clearLabels, closeGraphEngines, persistenceManagerFor } from '../support/GraphEngines';

jest.setTimeout(60_000);

@NodeFragment({ labels: ['Place'] })
class Place {
    @NodeId() uuid: string;
}

/** The places two relationships away either way round, each taken once in a walk, as Cypher walks a path (#597). */
@GraphView()
class PlaceReach {
    @Root() place: Place;
    @GraphRelationship({ type: 'NEXT_TO', direction: Direction.UNDIRECTED, target: () => Place, maxDepth: 2 })
    reach: Place[] = [];
}

describe.each(allStores())('A walk along an undirected relationship over hops on $type', (engine) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;

    beforeAll(async () => {
        pm = persistenceManagerFor(engine);
        gom = new StatelessGraphObjectManager(pm, backendFor(engine.type), new ModelRegistry());
        if (engine.type === DatabaseType.POSTGRES) {
            await pm.execute(new QuerySpecification(new PostgresGraph().ensuring));
        }
        await clearLabels(pm, engine, 'Place');
        // p1–p2, s1–s1, s2–s2 and s2–s3, each a NEXT_TO relationship.
        await pm.execute(
            new QuerySpecification({
                text:
                    "CREATE (p1:Place {uuid: 'p1'})-[:NEXT_TO]->(:Place {uuid: 'p2'}), " +
                    "(s1:Place {uuid: 's1'})-[:NEXT_TO]->(s1), " +
                    "(s2:Place {uuid: 's2'})-[:NEXT_TO]->(s2), (s2)-[:NEXT_TO]->(:Place {uuid: 's3'})",
                language: 'CYPHER'
            })
        );
    });

    afterAll(async () => {
        await clearLabels(pm, engine, 'Place');
        await closeGraphEngines();
    });

    it("doesn't go back over the relationship it took, and takes a self-loop as one relationship", async () => {
        const reaches: Record<string, string[]> = {};
        for (const it of await gom.loadAll(PlaceReach)) {
            reaches[it.place.uuid] = it.reach.map((p) => p.uuid).sort();
        }
        expect(reaches).toEqual({ p1: ['p2'], p2: ['p1'], s1: ['s1'], s2: ['s2', 's3'], s3: ['s2'] });
    });

    it('walks the list as a load does in a query-DSL condition on it', async () => {
        const reaching = async (uuid: string): Promise<string[]> =>
            (await gom.loadAll(PlaceReach, (q) => ({ where: q.reach.uuid.eq(uuid) })))
                .map((it) => it.place.uuid)
                .sort();
        expect(await reaching('p1')).toEqual(['p2']);
        expect(await reaching('s3')).toEqual(['s2']);
        expect(await reaching('s1')).toEqual(['s1']);
    });
});
