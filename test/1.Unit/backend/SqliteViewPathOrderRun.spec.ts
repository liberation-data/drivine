import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    backendFor,
    DatabaseRegistry,
    DatabaseType,
    Direction,
    GraphPath,
    GraphView,
    hop,
    ModelRegistry,
    NodeFragment,
    NodeId,
    PersistenceManager,
    PersistenceManagerFactory,
    QuerySpecification,
    Root,
    StatelessGraphObjectManager,
    TransactionContextHolder
} from '@liberation-data/drivine';

@NodeFragment({ labels: ['PathOrderRun', 'Actor'] })
class Actor {
    @NodeId() id: string;
}

@NodeFragment({ labels: ['PathOrderRun', 'Director'] })
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
 * A view's path ordered by a hop's property, run on SQLite, which Node bundles, so no container: ordered as Cypher, and
 * Neo4j, order the hop's property (#788), through the shared module's order fragments over the hop's node, as drivine4j's
 * `SqliteSelect.pathOrder` orders it. The library's own SQL before ordered a date by its tag's text, so `.5Z` came before
 * `Z` and an offset's moment was not read, and ordered a boolean as no value.
 */
describe("A view's path ordered by a hop's property, run on SQLite", () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'drivine-sqlite-path-order-'));
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;

    beforeAll(() => {
        DatabaseRegistry.getInstance()
            .builder()
            .withProperties({ databaseType: DatabaseType.SQLITE, host: '', databaseName: path.join(folder, 'g.db') })
            .register('pathOrder');
        pm = new PersistenceManagerFactory(DatabaseRegistry.getInstance(), TransactionContextHolder.getInstance()).get(
            'pathOrder',
            'NON_TRANSACTIONAL'
        );
        gom = new StatelessGraphObjectManager(pm, backendFor(DatabaseType.SQLITE), new ModelRegistry());
    });

    beforeEach(async () => {
        await pm.execute(
            new QuerySpecification({ text: 'MATCH (n:PathOrderRun) DETACH DELETE n', language: 'CYPHER' })
        );
    });

    afterAll(async () => {
        await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
        DatabaseRegistry.tearDown();
        fs.rmSync(folder, { recursive: true, force: true });
    });

    /** A datetime's tag as a save writes it: its text, then its sort key. */
    const datetime = (v: string, s: string): object => ({ $t: 'datetime', v, s });

    /**
     * Actor `a` acted in a movie of each value, directed by director `d<i>`, a movie without a value for `undefined`.
     * Each movie's properties are written as their JSON, a date as the tag a save writes, its text first.
     */
    async function create(values: unknown[]): Promise<void> {
        await pm.execute(
            new QuerySpecification({ text: "CREATE (:PathOrderRun:Actor {id: 'a'})", language: 'CYPHER' })
        );
        for (const [i, value] of values.entries()) {
            await pm.execute(
                new QuerySpecification({
                    text:
                        "MATCH (a:PathOrderRun:Actor {id: 'a'}) " +
                        `CREATE (a)-[:ACTED_IN]->(:PathOrderRun:Movie {id: 'm${i}'})` +
                        `-[:DIRECTED_BY]->(:PathOrderRun:Director {id: 'd${i}'})`,
                    language: 'CYPHER'
                })
            );
            await pm.execute(
                new QuerySpecification(`UPDATE drivine_node SET props = $props WHERE props ->> '$.id' = $was`).bind({
                    props: JSON.stringify({ id: `m${i}`, value }),
                    was: `m${i}`
                })
            );
        }
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

    it("orders a date hop property by its moment, an offset's included, not by its tag's text", async () => {
        await create([
            datetime('2024-01-01T00:00:00.5Z', '10000020240101000000500000000064800'),
            datetime('2024-01-01T00:00:00Z', '10000020240101000000000000000064800'),
            datetime('2024-01-01T01:00:00+02:00', '10000020231231230000000000000072000'),
            undefined
        ]);
        expect(await loaded()).toEqual({
            lowestFirst: ['d2', 'd1', 'd0', 'd3'],
            highestFirst: ['d0', 'd1', 'd2', 'd3'],
            lowest: 'd2',
            highest: 'd0'
        });
    });

    it('orders a hop property of mixed kinds as Cypher does: a text, a boolean, a number, and no value last', async () => {
        await create(['b', true, 10, 9, undefined, false, 'a']);
        expect(await loaded()).toEqual({
            lowestFirst: ['d6', 'd0', 'd5', 'd1', 'd3', 'd2', 'd4'],
            highestFirst: ['d2', 'd3', 'd1', 'd5', 'd0', 'd6', 'd4'],
            lowest: 'd6',
            highest: 'd2'
        });
    });

    it("orders a map, a list, a date and a text hop property in Cypher's order of kinds", async () => {
        await create(['a', datetime('2024-01-01T00:00:00Z', '10000020240101000000000000000064800'), [1], { k: 1 }]);
        expect(await loaded()).toEqual({
            lowestFirst: ['d3', 'd2', 'd1', 'd0'],
            highestFirst: ['d0', 'd1', 'd2', 'd3'],
            lowest: 'd3',
            highest: 'd0'
        });
    });

    it('orders an empty text as a text, the lowest, and targets of equal values by their node', async () => {
        await create(['', 'a', undefined, '']);
        expect(await loaded()).toEqual({
            lowestFirst: ['d0', 'd3', 'd1', 'd2'],
            highestFirst: ['d1', 'd0', 'd3', 'd2'],
            lowest: 'd0',
            highest: 'd1'
        });
    });

    it('keeps for a node reached by several hop nodes the first of them, a date and a number apart', async () => {
        // d0 is reached through a date and a number: lowest first it keeps the date, highest first the number.
        await create([
            datetime('2024-01-01T00:00:00.5Z', '10000020240101000000500000000064800'),
            'x',
            datetime('2024-01-01T00:00:00Z', '10000020240101000000000000000064800')
        ]);
        await pm.execute(
            new QuerySpecification({
                text:
                    "MATCH (a:PathOrderRun:Actor {id: 'a'}), (d:PathOrderRun:Director {id: 'd0'}) " +
                    "CREATE (a)-[:ACTED_IN]->(:PathOrderRun:Movie {id: 'm9', value: 7})-[:DIRECTED_BY]->(d)",
                language: 'CYPHER'
            })
        );
        expect(await loaded()).toEqual({
            lowestFirst: ['d2', 'd0', 'd1'],
            highestFirst: ['d0', 'd1', 'd2'],
            lowest: 'd2',
            highest: 'd0'
        });
    });
});
