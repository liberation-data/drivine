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
import { HeldAsLoaded } from '@/cypher/ValueLayout';
import { TargetModel } from '@/model/RelationshipModel';

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
    @Marked() mixed?: Set<string>;
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

    // Each write of a loaded node gives the loaded text back, which a save writes as the tag the store held while it is
    // unchanged since the load: an update of a node writes only the fields its change altered besides.
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

        it("in an update of a view: the root's change, and its related nodes and relationship fragments written whole", async () => {
            await gom.update(Diary, 'p', (it) => {
                it.plan!.event.name = 'updated';
            });
            await expectUndecoratedKept();
        });

        it('in a save of a changed copy given what it was loaded as', async () => {
            for (const id of ['e1', 'e2', 'e3', 'e4']) {
                const loaded = (await gom.load(Event, id))!;
                await gom.save(Object.assign(new Event(), loaded, { name: 'copied' }), { from: loaded });
            }
            await expectUndecoratedKept();
        });

        it('in a save of a changed copy of a view given what it was loaded as: its to-one and to-many written whole', async () => {
            // A view saved with from needs a stamped root: the event's, with e2 its to-one and e3 its to-many.
            const loaded = (await gom.load(EventView, 'e1'))!;
            const root = Object.assign(new Event(), loaded.event, { name: 'copied' });
            await gom.save(Object.assign(new EventView(), loaded, { event: root }), { from: loaded });
            await expectUndecoratedKept();
        });

        it('in a plain save of the node as loaded, a field changed', async () => {
            for (const id of ['e1', 'e2', 'e3', 'e4']) {
                const loaded = (await gom.load(Event, id))!;
                await gom.save(Object.assign(loaded, { name: 'resaved' }));
            }
            await expectUndecoratedKept();
        });

        it('in a plain save of a view as loaded: its root, a to-one, a to-many, a nested view, a relationship fragment', async () => {
            const loaded = (await gom.load(Diary, 'p'))!;
            loaded.plan!.event.name = 'resaved';
            await gom.save(loaded);
            await expectUndecoratedKept();
        });
    });

    /** The JSON text each DateLoadRun node's properties are stored as, by id, and each edge's, by type. */
    const stored = async (): Promise<Record<string, string>> => {
        const nodes = await pm.query<{ id: string; props: string }>(
            new QuerySpecification<{ id: string; props: string }>({
                text: "SELECT props ->> '$.id' AS id, props FROM drivine_node WHERE labels LIKE '%DateLoadRun%'",
                language: 'SQL'
            })
        );
        const edges = await pm.query<{ type: string; props: string }>(
            new QuerySpecification<{ type: string; props: string }>({
                text: 'SELECT type, props FROM drivine_edge',
                language: 'SQL'
            })
        );
        return Object.fromEntries([
            ...nodes.map((it) => [it.id, withoutStamp(it.props)]),
            ...edges.map((it) => [it.type, it.props])
        ]);
    };
    /** A node's properties as stored, without the stamp a save changes. */
    const withoutStamp = (props: string): string => props.replace(/,?"__drivine\.stamp":"[^"]*"/, '');

    describe('writes each property a save leaves as loaded as the store held it, byte for byte (#811)', () => {
        it('in a plain save and an update of a view: every node and edge but what changed is as it was', async () => {
            const before = await stored();
            const loaded = (await gom.load(Diary, 'p'))!;
            loaded.plan!.event.name = 'resaved';
            await gom.save(loaded);
            await gom.update(Diary, 'p', (it) => {
                it.plan!.next!.name = 'updated';
            });
            const after = await stored();
            expect(after.e1).toEqual(before.e1.replace('"name":"e1"', '"name":"resaved"'));
            expect(after.e2).toEqual(before.e2.replace('"name":"e2"', '"name":"updated"'));
            for (const key of ['e3', 'e4', 'p', 'ATTENDS', 'PLANS', 'NEXT', 'FOLLOWS']) {
                expect([key, after[key]]).toEqual([key, before[key]]);
            }
        });

        it('in a saveAll of nodes as loaded', async () => {
            const before = await stored();
            const loaded = await gom.loadAll(Event);
            loaded.forEach((it) => (it.name = `${it.id}!`));
            await gom.saveAll(loaded);
            const after = await stored();
            for (const id of ['e1', 'e2', 'e3', 'e4']) {
                expect(after[id]).toEqual(before[id].replace(`"name":"${id}"`, `"name":"${id}!"`));
            }
        });

        it("gives a graph engine's save of a node a SQL store loaded the value, never what the store held", async () => {
            const loaded = (await gom.load(Diary, 'p'))!;
            const registry = new ModelRegistry();
            const diary: TargetModel = { kind: 'GRAPH_VIEW', model: registry.view(Diary) };
            const markers = (value: any): number =>
                value instanceof HeldAsLoaded
                    ? 1
                    : value !== null && typeof value === 'object'
                    ? Object.values(value).reduce((sum: number, it) => sum + markers(it), 0)
                    : 0;
            const sql = backendFor(DatabaseType.SQLITE).save(diary, loaded, {}, false, registry);
            // A SQL store's save binds its plan written, each undecorated date the tag the store held.
            expect(
                Object.values(sql.bindings).find((it) => typeof it === 'string' && it.includes('"undecorated"'))
            ).toContain('"undecorated":{"$t":"datetime"');
            for (const engine of [DatabaseType.NEO4J, DatabaseType.MEMGRAPH, DatabaseType.FALKORDB]) {
                const statement = backendFor(engine).save(diary, loaded, {}, false, registry);
                expect([engine, markers(statement.bindings)]).toEqual([engine, 0]);
                expect(JSON.stringify(statement.bindings)).toContain('"undecorated":"2026-01-01T00:00:00Z"');
            }
        });

        it("keeps a datetime's nanoseconds and offset, which a Date can't hold, in a field declared a Date too", async () => {
            await pm.execute(
                new QuerySpecification({
                    text:
                        "MATCH (n:DateLoadRun:Event {id: 'e1'}) SET n.at = datetime('2026-01-01T00:00:00.123456789+02:00'), " +
                        "n.undecorated = localdatetime('2026-01-01T10:11:12.5'), n.undecoratedDays = [date('2026-01-01'), " +
                        "duration('P1Y2M3DT4H5M6.789S')]",
                    language: 'CYPHER'
                })
            );
            const before = await stored();
            const loaded = (await gom.load(Event, 'e1'))!;
            expect(loaded.at).toEqual(new Date('2025-12-31T22:00:00.123Z'));
            await gom.save(Object.assign(loaded, { name: 'resaved' }));
            expect((await stored()).e1).toEqual(before.e1.replace('"name":"e1"', '"name":"resaved"'));
        });

        it('writes a value changed since the load afresh: in place, in a list, or given anew', async () => {
            const loaded = (await gom.load(Event, 'e1'))!;
            loaded.at!.setTime(moment(5).getTime());
            loaded.undecoratedDays!.push(moment(6));
            loaded.undecorated = moment(7) as any;
            await gom.save(loaded);
            const again = (await gom.load(Event, 'e1'))!;
            expect(again.at).toEqual(moment(5));
            expect(again.undecoratedDays).toEqual(['2026-01-01T00:00:00Z', '2026-01-06T00:00:00Z']);
            const found = await gom.loadAll(Event, (q) => ({ where: q.property('undecorated').eq(moment(7)) }));
            expect(found.map((it) => it.id)).toEqual(['e1']);
            // A text given in place of the date is a text, as a save of a fresh object writes it.
            await gom.update(Event, 'e1', (it) => {
                it.undecorated = 'not a date' as any;
            });
            expect((await stored()).e1).toContain('"undecorated":"not a date"');
        });

        it('writes a fresh object as it always has: a Date its tag, a text a text', async () => {
            await gom.save(Object.assign(event('e9', 9), { undecoratedDays: ['2026-01-09T00:00:00Z'] as any }));
            const props = (await stored()).e9;
            expect(props).toContain('"undecorated":{"$t":"datetime","v":"2026-01-09T00:00:00Z"');
            expect(props).toContain('"undecoratedDays":["2026-01-09T00:00:00Z"]');
        });

        it('writes a set given in another order afresh, its items where the set has them', async () => {
            await pm.execute(
                new QuerySpecification({
                    text: "MATCH (n:DateLoadRun:Event {id: 'e1'}) SET n.mixed = ['a', date('2026-01-01')]",
                    language: 'CYPHER'
                })
            );
            const loaded = (await gom.load(Event, 'e1'))!;
            expect(loaded.mixed).toEqual(new Set(['a', '2026-01-01']));
            // The same items, so a set equal to the one loaded, but not held in the order the store holds them.
            loaded.mixed = new Set(['2026-01-01', 'a']);
            await gom.save(loaded);
            expect((await gom.load(Event, 'e1'))!.mixed).toEqual(new Set(['2026-01-01', 'a']));
            expect((await stored()).e1).toContain('"mixed":["2026-01-01","a"]');
        });

        it('recognises a copy given what it was loaded as, and not a copy saved without it', async () => {
            const loaded = (await gom.load(Event, 'e2'))!;
            await gom.save(Object.assign(new Event(), loaded, { name: 'copied' }), { from: loaded });
            const before = await stored();
            expect(before.e2).toContain('"undecorated":{"$t":"datetime"');
            // A residual, documented: a copy of a loaded object saved without from writes the text it was given.
            const again = (await gom.load(Event, 'e2'))!;
            await gom.save(Object.assign(new Event(), again, { name: 'spread' }));
            expect((await stored()).e2).toContain('"undecorated":"2026-01-02T00:00:00Z"');
        });
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
