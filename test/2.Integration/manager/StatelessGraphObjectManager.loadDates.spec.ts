import {
    backendFor,
    DatabaseType,
    Direction,
    GraphPath,
    GraphProperty,
    GraphRelationship,
    GraphView,
    ModelRegistry,
    NodeFragment,
    NodeId,
    nodeRef,
    PersistenceManager,
    PostgresGraph,
    QuerySpecification,
    RelationshipFragment,
    Root,
    SqliteGraph,
    StatelessGraphObjectManager,
    TargetNode
} from '@liberation-data/drivine';
import { allStores, clearLabels, closeGraphEngines, persistenceManagerFor } from '../support/GraphEngines';

jest.setTimeout(30_000);

/** A decorator of another library, which records the field's type as any decorator does, and tells Drivine nothing. */
const Marked = (): PropertyDecorator => () => undefined;

@NodeFragment({ labels: ['LoadDate', 'Event'] })
class Event {
    @NodeId() id: string;
    @Marked() at?: Date;
    @GraphProperty('due_at') due?: Date;
}

@NodeFragment({ labels: ['LoadDate', 'Person'] })
class Person {
    @NodeId() id: string;
}

@RelationshipFragment()
class Attendance {
    @Marked() since?: Date;
    @TargetNode() event: Event;
}

@GraphView()
class EventView {
    @Root() event: Event;
    @GraphRelationship({ type: 'NEXT', target: () => Event }) next?: Event;
    @GraphRelationship({ type: 'FOLLOWS', target: () => Event }) followers: Event[];
}

@GraphView()
class Diary {
    @Root() person: Person;
    @GraphRelationship({ type: 'PLANS' }) plan?: EventView;
    @GraphRelationship({ type: 'ATTENDS', target: () => Attendance }) attended: Attendance[];
    @GraphPath([{ type: 'PLANS' }, { type: 'NEXT' }], { target: () => Event }) after: Event[];
}

/** Whole seconds, as Memgraph's datetime() reads no fraction before `Z`. */
const moment = (day: number): Date => new Date(`2026-01-0${day}T00:00:00.000Z`);
const SINCE = new Date('2025-12-01T00:00:00.000Z');

/**
 * A property declared a Date loads as a Date on every store, the instant Neo4j's driver gives (#807): Oracle, Postgres,
 * SQLite and FalkorDB gave its text before, where Neo4j and Memgraph gave a Date.
 */
describe.each(allStores())('a property declared a Date, loaded on $type', (store) => {
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
        await clearLabels(pm, store, 'LoadDate');
        if ([DatabaseType.NEO4J, DatabaseType.MEMGRAPH].includes(store.type)) {
            // Made by Cypher's datetime() on Neo4j and Memgraph, whose drivers send a JavaScript Date as an empty map,
            // which a save can't write (#810).
            const at = (date: Date): string => `datetime('${date.toISOString().replace('.000Z', 'Z')}')`;
            const node = (id: string, day: number): string =>
                `(${id}:LoadDate:Event {id: '${id}', at: ${at(moment(day))}, due_at: ${at(moment(day + 1))}})`;
            await pm.execute(
                new QuerySpecification({
                    text:
                        `CREATE (p:LoadDate:Person {id: 'p'}), ${node('e1', 1)}, ${node('e2', 2)}, ${node('e3', 3)}, ` +
                        `${node('e4', 4)}, (p)-[:PLANS]->(e1), (e1)-[:NEXT]->(e2), (e1)-[:FOLLOWS]->(e3), ` +
                        `(p)-[:ATTENDS {since: ${at(SINCE)}}]->(e4)`,
                    language: 'CYPHER'
                })
            );
            return;
        }
        const event = (id: string, day: number): Event =>
            Object.assign(new Event(), { id, at: moment(day), due: moment(day + 1) });
        await gom.save(
            Object.assign(new Diary(), {
                person: Object.assign(new Person(), { id: 'p' }),
                plan: Object.assign(new EventView(), {
                    event: event('e1', 1),
                    next: event('e2', 2),
                    followers: [event('e3', 3)]
                }),
                attended: [Object.assign(new Attendance(), { since: SINCE, event: event('e4', 4) })]
            })
        );
    });

    afterAll(async () => {
        await clearLabels(pm, store, 'LoadDate');
        await closeGraphEngines();
    });

    const expectEvent = (loaded: Event | undefined, id: string, day: number): void => {
        expect(loaded?.at).toBeInstanceOf(Date);
        expect(loaded?.due).toBeInstanceOf(Date);
        expect([loaded?.id, loaded?.at, loaded?.due]).toEqual([id, moment(day), moment(day + 1)]);
    };

    it('gives a load and a loadAll a Date', async () => {
        expectEvent(await gom.load(Event, 'e1'), 'e1', 1);
        const all = (await gom.loadAll(Event)).sort((a, b) => (a.id < b.id ? -1 : 1));
        expect(all.map((it) => it.id)).toEqual(['e1', 'e2', 'e3', 'e4']);
        all.forEach((it, i) => expectEvent(it, `e${i + 1}`, i + 1));
    });

    it("gives a view's relationships, a nested view, a relationship fragment and a path's end a Date", async () => {
        const diary = (await gom.load(Diary, 'p'))!;
        expectEvent(diary.plan!.event, 'e1', 1);
        expectEvent(diary.plan!.next, 'e2', 2);
        expectEvent(diary.plan!.followers[0], 'e3', 3);
        expect(diary.attended[0].since).toBeInstanceOf(Date);
        expect(diary.attended[0].since).toEqual(SINCE);
        expectEvent(diary.attended[0].event, 'e4', 4);
        expectEvent(diary.after[0], 'e2', 2);
    });

    it('gives loadRelated a Date', async () => {
        const related = await gom.edges.loadRelated(nodeRef(Person, 'p'), 'ATTENDS', Direction.OUTGOING, Event);
        expectEvent(related[0], 'e4', 4);
    });
});
