import {
    backendFor,
    DatabaseType,
    Direction,
    GraphPath,
    GraphView,
    hop,
    ModelRegistry,
    NodeFragment,
    NodeId,
    PersistenceManager,
    PostgresGraph,
    QuerySpecification,
    Root,
    SqliteGraph,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';
import { allStores, clearLabels, closeGraphEngines, persistenceManagerFor } from '../support/GraphEngines';

// Neo4j plans each statement the first time it sees it, beside the suites running in parallel (#349).
jest.setTimeout(60_000);

@NodeFragment({ labels: ['OrderedPathKind', 'Actor'] })
class Actor {
    @NodeId() id: string;
}

@NodeFragment({ labels: ['OrderedPathKind', 'Director'] })
class Director {
    @NodeId() id: string;
}

@GraphView()
class ActorDirectors {
    @Root() actor: Actor;
    @GraphPath([hop('ACTED_IN', Direction.OUTGOING, 'Movie', 'value'), hop('DIRECTED_BY')], { target: () => Director })
    lowestFirst: Director[];
    @GraphPath([hop('ACTED_IN', Direction.OUTGOING, 'Movie', 'value', false), hop('DIRECTED_BY')], {
        target: () => Director
    })
    highestFirst: Director[];
    @GraphPath([hop('ACTED_IN', Direction.OUTGOING, 'Movie', 'value'), hop('DIRECTED_BY')], { target: () => Director })
    lowest?: Director;
    @GraphPath([hop('ACTED_IN', Direction.OUTGOING, 'Movie', 'value', false), hop('DIRECTED_BY')], {
        target: () => Director
    })
    highest?: Director;
}

/**
 * A view's path ordered by a hop's property gives Neo4j's order on every store whose Cypher orders the property's kinds
 * (#788): a date by its moment, an offset's included, and kinds in Cypher's order, a temporal, a text, a boolean, a number,
 * no value last. On the SQL stores the path is ordered by the shared module's order fragments over the hop's node, as
 * drivine4j orders it; the library's own SQL before ordered a date by its tag's text (`.5Z` before `Z`) and kinds out of
 * Cypher's order. On the graph engines the rows are sorted by ORDER BY before they are collected (#799). Memgraph,
 * which orders no values of two kinds, ranks a text before a boolean before any other value first, so it is held to
 * the mixed kinds without a temporal value. FalkorDB, which orders temporals and mixed kinds by its own rules, is left
 * out.
 */
describe.each(allStores().filter((it) => it.type !== DatabaseType.FALKORDB))(
    "A view's path ordered by a hop's date or mixed kinds on $type",
    (store) => {
        let pm: PersistenceManager;
        let gom: StatelessGraphObjectManager;

        beforeAll(async () => {
            pm = persistenceManagerFor(store);
            gom = new StatelessGraphObjectManager(pm, backendFor(store.type), new ModelRegistry());
            if (store.type === DatabaseType.POSTGRES) {
                await pm.execute(new QuerySpecification(new PostgresGraph().ensuring));
            }
            if (store.type === DatabaseType.SQLITE) {
                await pm.execute(new QuerySpecification(new SqliteGraph().ensuring));
            }
        });

        beforeEach(async () => {
            await clearLabels(pm, store, 'OrderedPathKind');
        });

        afterAll(async () => {
            await clearLabels(pm, store, 'OrderedPathKind');
            await closeGraphEngines();
        });

        /** Actor `a`, who acted in a movie of each value, Cypher's, directed by `d<i>`; `null` for a movie without one. */
        async function create(values: string[]): Promise<void> {
            const movies = values.map(
                (value, i) =>
                    `(a)-[:ACTED_IN]->(:OrderedPathKind:Movie {id: 'm${i}'${
                        value === 'null' ? '' : `, value: ${value}`
                    }})` + `-[:DIRECTED_BY]->(:OrderedPathKind:Director {id: 'd${i}'})`
            );
            await pm.execute(
                new QuerySpecification({
                    text: `CREATE (a:OrderedPathKind:Actor {id: 'a'}), ${movies.join(', ')}`,
                    language: 'CYPHER'
                })
            );
        }

        async function loaded(): Promise<{
            lowestFirst: string[];
            highestFirst: string[];
            lowest?: string;
            highest?: string;
        }> {
            const view = (await gom.load(ActorDirectors, 'a'))!;
            return {
                lowestFirst: view.lowestFirst.map((it) => it.id),
                highestFirst: view.highestFirst.map((it) => it.id),
                lowest: view.lowest?.id,
                highest: view.highest?.id
            };
        }

        // Not on Memgraph, which orders a zoned date by its own rules, and refuses to order a date beside a number.
        const dated = store.type === DatabaseType.MEMGRAPH ? it.skip : it;

        dated("orders a date hop property by its moment, an offset's included, not by its text", async () => {
            await create([
                "datetime('2024-01-01T00:00:00.5Z')",
                "datetime('2024-01-01T00:00:00Z')",
                "datetime('2024-01-01T01:00:00+02:00')",
                'null'
            ]);
            expect(await loaded()).toEqual({
                lowestFirst: ['d2', 'd1', 'd0', 'd3'],
                highestFirst: ['d0', 'd1', 'd2', 'd3'],
                lowest: 'd2',
                highest: 'd0'
            });
        });

        // Held on Postgres, where the pinned compiler (0.50.0) orders kinds in jsonb's order, a number before a boolean and
        // a temporal after a text (liberation-data/drivine-cypher-spec#371, fixed by #374 after 0.50.0: unfail at the
        // bump).
        const mixed = store.type === DatabaseType.POSTGRES ? it.failing : it;
        const mixedAndDated = store.type === DatabaseType.MEMGRAPH ? it.skip : mixed;

        mixed(
            'orders a hop property of mixed kinds as Cypher does: a text, a boolean, a number, no value last',
            async () => {
                await create(["'b'", 'true', '10', '9', 'null', 'false', "'a'"]);
                expect(await loaded()).toEqual({
                    lowestFirst: ['d6', 'd0', 'd5', 'd1', 'd3', 'd2', 'd4'],
                    highestFirst: ['d2', 'd3', 'd1', 'd5', 'd0', 'd6', 'd4'],
                    lowest: 'd6',
                    highest: 'd2'
                });
            }
        );

        mixedAndDated(
            'keeps for a node reached by a date and a number the date lowest first, the number highest',
            async () => {
                await create(["datetime('2024-01-01T00:00:00.5Z')", "'x'", "datetime('2024-01-01T00:00:00Z')"]);
                await pm.execute(
                    new QuerySpecification({
                        text:
                            "MATCH (a:OrderedPathKind:Actor {id: 'a'}), (d:OrderedPathKind:Director {id: 'd0'}) " +
                            "CREATE (a)-[:ACTED_IN]->(:OrderedPathKind:Movie {id: 'm9', value: 7})-[:DIRECTED_BY]->(d)",
                        language: 'CYPHER'
                    })
                );
                expect(await loaded()).toEqual({
                    lowestFirst: ['d2', 'd0', 'd1'],
                    highestFirst: ['d0', 'd1', 'd2'],
                    lowest: 'd2',
                    highest: 'd0'
                });
            }
        );
    }
);
