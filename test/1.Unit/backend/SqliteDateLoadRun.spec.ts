import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    backendFor,
    DatabaseRegistry,
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
    NodeStamp,
    PersistenceManager,
    PersistenceManagerFactory,
    QuerySpecification,
    RelationshipFragment,
    Root,
    StatelessGraphObjectManager,
    TargetNode,
    TransactionContextHolder
} from '@liberation-data/drivine';

/** A decorator of another library, which records the field's type as any decorator does, and tells Drivine nothing. */
const Marked = (): PropertyDecorator => () => undefined;

@NodeFragment({ labels: ['DateLoadRun', 'Event'] })
class Event {
    @NodeId() id: string;
    @Marked() name?: string;
    @Marked() at?: Date;
    @GraphProperty('due_at') due?: Date;
    undecorated?: Date;
    undecoratedDays?: Date[];
    @NodeStamp() stamp?: string;
}

@NodeFragment({ labels: ['DateLoadRun', 'Person'] })
class Person {
    @NodeId() id: string;
}

@NodeFragment({ labels: ['DateLoadRun', 'Day'] })
class Day {
    @NodeId() id: Date;
    @Marked() name?: string;
}

@RelationshipFragment()
class Attendance {
    @Marked() since?: Date;
    undecoratedSince?: Date;
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

const moment = (day: number): Date => new Date(`2026-01-0${day}T00:00:00.000Z`);
const SINCE = new Date('2025-12-01T00:00:00.000Z');

const event = (id: string, day: number): Event =>
    Object.assign(new Event(), {
        id,
        name: id,
        at: moment(day),
        due: moment(day + 1),
        undecorated: moment(day),
        undecoratedDays: [moment(day)]
    });

/**
 * A property declared a Date, loaded on SQLite, which Node bundles, so no container: a Date on every load path, as
 * Neo4j's driver gives one (#807). A field TypeScript records no type of is the text the store holds.
 */
describe('A property declared a Date, loaded on SQLite', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'drivine-sqlite-date-load-'));
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;

    beforeAll(() => {
        DatabaseRegistry.getInstance()
            .builder()
            .withProperties({ databaseType: DatabaseType.SQLITE, host: '', databaseName: path.join(folder, 'g.db') })
            .register('dateLoad');
        pm = new PersistenceManagerFactory(DatabaseRegistry.getInstance(), TransactionContextHolder.getInstance()).get(
            'dateLoad',
            'NON_TRANSACTIONAL'
        );
        gom = new StatelessGraphObjectManager(pm, backendFor(DatabaseType.SQLITE), new ModelRegistry());
    });

    beforeEach(async () => {
        await pm.execute(new QuerySpecification({ text: 'MATCH (n:DateLoadRun) DETACH DELETE n', language: 'CYPHER' }));
        await gom.save(
            Object.assign(new Diary(), {
                person: Object.assign(new Person(), { id: 'p' }),
                plan: Object.assign(new EventView(), {
                    event: event('e1', 1),
                    next: event('e2', 2),
                    followers: [event('e3', 3)]
                }),
                attended: [
                    Object.assign(new Attendance(), { since: SINCE, undecoratedSince: SINCE, event: event('e4', 4) })
                ]
            })
        );
    });

    afterAll(async () => {
        await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
        DatabaseRegistry.tearDown();
        fs.rmSync(folder, { recursive: true, force: true });
    });

    const expectEvent = (loaded: Event | undefined, day: number): void => {
        expect(loaded?.at).toBeInstanceOf(Date);
        expect([loaded?.id, loaded?.at, loaded?.due]).toEqual([loaded?.id, moment(day), moment(day + 1)]);
        // Not declared a Date where TypeScript records it: the text the store gives, of the same instant.
        expect(typeof loaded?.undecorated).toEqual('string');
        expect(new Date(loaded!.undecorated!)).toEqual(moment(day));
    };

    it('gives a load and a loadAll a Date', async () => {
        expectEvent(await gom.load(Event, 'e1'), 1);
        const all = await gom.loadAll(Event, (q) => ({ orderBy: q.at.asc() }));
        expect(all.map((it) => it.id)).toEqual(['e1', 'e2', 'e3', 'e4']);
        all.forEach((it, i) => expectEvent(it, i + 1));
    });

    it("gives a view's root, its relationships, a nested view, a relationship fragment and a path's end a Date", async () => {
        const diary = (await gom.load(Diary, 'p'))!;
        expectEvent(diary.plan!.event, 1);
        expectEvent(diary.plan!.next, 2);
        expectEvent(diary.plan!.followers[0], 3);
        expect(diary.attended[0].since).toBeInstanceOf(Date);
        expect(diary.attended[0].since).toEqual(SINCE);
        expectEvent(diary.attended[0].event, 4);
        expectEvent(diary.after[0], 2);
    });

    it("orders a view's list by a Date field by its instant, as the Dates it loads", async () => {
        const [early, middle, late] = [moment(1), moment(2), moment(3)];
        await gom.save(
            Object.assign(new EventView(), {
                event: event('e5', 5),
                followers: [
                    Object.assign(event('f1', 1), { at: middle }),
                    Object.assign(event('f2', 1), { at: late }),
                    Object.assign(event('f3', 1), { at: early })
                ]
            })
        );
        for (const [order, ids] of [
            ['asc', ['f3', 'f1', 'f2']],
            ['desc', ['f2', 'f1', 'f3']]
        ] as const) {
            const views = await gom.loadAll(EventView, (q) => ({ orderBy: q.followers.at[order]() }));
            const followers = views.find((it) => it.event.id === 'e5')!.followers;
            expect(followers.map((it) => it.id)).toEqual(ids);
            followers.forEach((it) => expect(it.at).toBeInstanceOf(Date));
        }
    });

    it('gives loadRelated a Date', async () => {
        const related = await gom.edges.loadRelated(nodeRef(Person, 'p'), 'ATTENDS', Direction.OUTGOING, Event);
        expectEvent(related[0], 4);
    });

    it('updates a node loaded with a Date: an unchanged one is kept, and a changed one written', async () => {
        await gom.update(Event, 'e1', (it) => {
            it.name = 'renamed';
        });
        const renamed = (await gom.load(Event, 'e1'))!;
        expect(renamed.name).toEqual('renamed');
        expectEvent(renamed, 1);
        await gom.update(Event, 'e1', (it) => {
            it.at = new Date(it.at!.getTime() + 500);
        });
        expect((await gom.load(Event, 'e1'))!.at).toEqual(new Date('2026-01-01T00:00:00.500Z'));
    });

    it('saves a changed copy of a node loaded with a Date, checked against what it was loaded as', async () => {
        const loaded = (await gom.load(Event, 'e2'))!;
        const changed = Object.assign(new Event(), loaded, { name: 'copied' });
        await gom.save(changed, { from: loaded });
        const saved = (await gom.load(Event, 'e2'))!;
        expect(saved.name).toEqual('copied');
        expectEvent(saved, 2);
    });

    it('saves a node loaded with a Date back as a Date, so a where on the date still finds it', async () => {
        // Before #807 the loaded text was saved back as a text, in place of the Date's tag, and the where found nothing.
        const loaded = (await gom.load(Event, 'e1'))!;
        await gom.save(Object.assign(loaded, { name: 'resaved' }));
        await gom.update(Event, 'e2', (it) => {
            it.name = 'updated';
        });
        for (const [id, day] of [
            ['e1', 1],
            ['e2', 2]
        ] as const) {
            const found = await gom.loadAll(Event, (q) => ({
                where: [q.at.eq(moment(day)), q.due.eq(moment(day + 1)), q.at.gt(SINCE)]
            }));
            expect(found.map((it) => it.id)).toEqual([id]);
        }
    });

    /**
     * Whether each undecorated Date the fixture saved is still held as a date (#811): the where on the root's
     * `undecorated` finds each event by its instant, an order by it puts them in time order, an item of
     * `undecoratedDays` is found by its instant, and so is the relationship fragment's `undecoratedSince`. A date
     * written back as its text is none of these: a compare of a text with a date is false, and a text orders after
     * every date.
     */
    const expectUndecoratedKept = async (): Promise<void> => {
        for (const day of [1, 2, 3, 4]) {
            const found = await gom.loadAll(Event, (q) => ({ where: q.property('undecorated').eq(moment(day)) }));
            expect(found.map((it) => it.id)).toEqual([`e${day}`]);
            const listed = await pm.query<string>(
                new QuerySpecification<string>({
                    text: 'MATCH (n:DateLoadRun:Event) WHERE $day IN n.undecoratedDays RETURN n.id',
                    language: 'CYPHER'
                }).bind({ day: moment(day) })
            );
            expect(listed).toEqual([`e${day}`]);
        }
        const ordered = await gom.loadAll(Event, (q) => ({ orderBy: q.property('undecorated').asc() }));
        expect(ordered.map((it) => it.id)).toEqual(['e1', 'e2', 'e3', 'e4']);
        const since = await pm.query<number>(
            new QuerySpecification<number>({
                text: 'MATCH (:DateLoadRun)-[r:ATTENDS]->(:DateLoadRun) WHERE r.undecoratedSince = $since RETURN count(r)',
                language: 'CYPHER'
            }).bind({ since: SINCE })
        );
        expect(since).toEqual([1]);
    };

    // it.failing marks what #811 still has to fix: a write that gives the loaded text back writes it over the tag.
    // Only an update of a node, which writes only the fields its change altered, keeps the tag today.
    describe('keeps an undecorated Date as a date when a loaded node is written back (#811)', () => {
        it('holds every undecorated Date as a date once saved', async () => {
            await expectUndecoratedKept();
        });

        it('in an update of the node, which writes only what the change altered', async () => {
            for (const id of ['e1', 'e2', 'e3', 'e4']) {
                await gom.update(Event, id, (it) => {
                    it.name = 'updated';
                });
            }
            await expectUndecoratedKept();
        });

        it.failing(
            "in an update of a view: the root's change, and its related nodes and relationship fragments written whole",
            async () => {
                await gom.update(Diary, 'p', (it) => {
                    it.plan!.event.name = 'updated';
                });
                await expectUndecoratedKept();
            }
        );

        it.failing('in a save of a changed copy given what it was loaded as', async () => {
            for (const id of ['e1', 'e2', 'e3', 'e4']) {
                const loaded = (await gom.load(Event, id))!;
                await gom.save(Object.assign(new Event(), loaded, { name: 'copied' }), { from: loaded });
            }
            await expectUndecoratedKept();
        });

        it.failing(
            'in a save of a changed copy of a view given what it was loaded as: its to-one and to-many written whole',
            async () => {
                // A view saved with from needs a stamped root: the event's, with e2 its to-one and e3 its to-many.
                const loaded = (await gom.load(EventView, 'e1'))!;
                const root = Object.assign(new Event(), loaded.event, { name: 'copied' });
                await gom.save(Object.assign(new EventView(), loaded, { event: root }), { from: loaded });
                await expectUndecoratedKept();
            }
        );

        it.failing('in a plain save of the node as loaded, a field changed', async () => {
            for (const id of ['e1', 'e2', 'e3', 'e4']) {
                const loaded = (await gom.load(Event, id))!;
                await gom.save(Object.assign(loaded, { name: 'resaved' }));
            }
            await expectUndecoratedKept();
        });

        it.failing(
            'in a plain save of a view as loaded: its root, a to-one, a to-many, a nested view, a relationship fragment',
            async () => {
                const loaded = (await gom.load(Diary, 'p'))!;
                loaded.plan!.event.name = 'resaved';
                await gom.save(loaded);
                await expectUndecoratedKept();
            }
        );
    });

    it('gives a Date id as a Date, which finds the node again', async () => {
        await gom.save(Object.assign(new Day(), { id: moment(5), name: 'fifth' }));
        const day = (await gom.load(Day, '2026-01-05'))!;
        expect(day.id).toBeInstanceOf(Date);
        expect(day.id).toEqual(moment(5));
        await gom.update(Day, day.id, (it) => {
            it.name = 'still fifth';
        });
        expect((await gom.load(Day, day.id))?.name).toEqual('still fifth');
        expect(await gom.count(Day)).toEqual(1);
    });
});
