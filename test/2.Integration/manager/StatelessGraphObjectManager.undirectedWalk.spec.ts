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

/** Each place next to it, with the places two relationships away from that one: a nested view's list over hops. */
@GraphView()
class PlaceAround {
    @Root() place: Place;
    @GraphRelationship({ type: 'NEXT_TO', direction: Direction.UNDIRECTED, target: () => PlaceReach })
    around: PlaceReach[] = [];
}

@NodeFragment({ labels: ['Stop'] })
class Stop {
    @NodeId() uuid: string;
}

/** The stops three relationships ahead and two behind along a directed relationship, which a ring comes back on. */
@GraphView()
class StopReach {
    @Root() stop: Stop;
    @GraphRelationship({ type: 'THEN', direction: Direction.OUTGOING, target: () => Stop, maxDepth: 3 })
    ahead: Stop[] = [];
    @GraphRelationship({ type: 'THEN', direction: Direction.INCOMING, target: () => Stop, maxDepth: 2 })
    behind: Stop[] = [];
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
        await clearLabels(pm, engine, 'Place', 'Stop');
        // p1–p2, s1–s1, s2–s2 and s2–s3, each a NEXT_TO relationship, and two between q1 and q2.
        await pm.execute(
            new QuerySpecification({
                text:
                    "CREATE (p1:Place {uuid: 'p1'})-[:NEXT_TO]->(:Place {uuid: 'p2'}), " +
                    "(s1:Place {uuid: 's1'})-[:NEXT_TO]->(s1), " +
                    "(s2:Place {uuid: 's2'})-[:NEXT_TO]->(s2), (s2)-[:NEXT_TO]->(:Place {uuid: 's3'}), " +
                    "(q1:Place {uuid: 'q1'})-[:NEXT_TO]->(q2:Place {uuid: 'q2'}), (q1)-[:NEXT_TO]->(q2)",
                language: 'CYPHER'
            })
        );
        // A ring r1 → r2 → r3 → r1, and r3 → r4 off it.
        await pm.execute(
            new QuerySpecification({
                text:
                    "CREATE (r1:Stop {uuid: 'r1'})-[:THEN]->(r2:Stop {uuid: 'r2'})-[:THEN]->(r3:Stop {uuid: 'r3'}), " +
                    "(r3)-[:THEN]->(r1), (r3)-[:THEN]->(:Stop {uuid: 'r4'})",
                language: 'CYPHER'
            })
        );
    });

    afterAll(async () => {
        await clearLabels(pm, engine, 'Place', 'Stop');
        await closeGraphEngines();
    });

    it("doesn't go back over the relationship it took, and takes a self-loop as one relationship", async () => {
        const reaches: Record<string, string[]> = {};
        for (const it of await gom.loadAll(PlaceReach)) {
            reaches[it.place.uuid] = it.reach.map((p) => p.uuid).sort();
        }
        expect(reaches).toEqual({
            p1: ['p2'],
            p2: ['p1'],
            s1: ['s1'],
            s2: ['s2', 's3'],
            s3: ['s2'],
            // Back over the other of the two relationships: one not yet taken.
            q1: ['q1', 'q2'],
            q2: ['q1', 'q2']
        });
    });

    it('walks the list over hops in a view nested in another', async () => {
        const around: Record<string, Record<string, string[]>> = {};
        for (const it of await gom.loadAll(PlaceAround)) {
            around[it.place.uuid] = Object.fromEntries(
                it.around.map((next) => [next.place.uuid, next.reach.map((p) => p.uuid).sort()])
            );
        }
        expect(around).toEqual({
            p1: { p2: ['p1'] },
            p2: { p1: ['p2'] },
            s1: { s1: ['s1'] },
            s2: { s2: ['s2', 's3'], s3: ['s2'] },
            s3: { s2: ['s2', 's3'] },
            q1: { q2: ['q1', 'q2'] },
            q2: { q1: ['q1', 'q2'] }
        });
    });

    it('walks a directed relationship each way round, coming back to the root around a ring', async () => {
        const reaches: Record<string, { ahead: string[]; behind: string[] }> = {};
        for (const it of await gom.loadAll(StopReach)) {
            reaches[it.stop.uuid] = {
                ahead: it.ahead.map((s) => s.uuid).sort(),
                behind: it.behind.map((s) => s.uuid).sort()
            };
        }
        expect(reaches).toEqual({
            r1: { ahead: ['r1', 'r2', 'r3', 'r4'], behind: ['r2', 'r3'] },
            r2: { ahead: ['r1', 'r2', 'r3', 'r4'], behind: ['r1', 'r3'] },
            r3: { ahead: ['r1', 'r2', 'r3', 'r4'], behind: ['r1', 'r2'] },
            r4: { ahead: [], behind: ['r2', 'r3'] }
        });
    });

    it('walks the list as a load does in a query-DSL condition on it', async () => {
        const reaching = async (uuid: string): Promise<string[]> =>
            (await gom.loadAll(PlaceReach, (q) => ({ where: q.reach.uuid.eq(uuid) })))
                .map((it) => it.place.uuid)
                .sort();
        expect(await reaching('p1')).toEqual(['p2']);
        expect(await reaching('s3')).toEqual(['s2']);
        expect(await reaching('s1')).toEqual(['s1']);
        expect(await reaching('q1')).toEqual(['q1', 'q2']);
    });
});
