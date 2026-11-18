import {
    backendFor,
    DatabaseType,
    GraphRelationship,
    GraphView,
    ModelRegistry,
    NodeFragment,
    NodeId,
    NodeStamp,
    PersistenceManager,
    PostgresGraph,
    QuerySpecification,
    RelationshipFragment,
    Root,
    SqliteGraph,
    StatelessGraphObjectManager,
    TargetNode
} from '@liberation-data/drivine';
import { clearLabels, closeGraphEngines } from '../support/GraphEngines';
import { SqlStore, sqlPersistenceManager, sqlStores } from '../support/SqlStores';

jest.setTimeout(30_000);

/** A decorator of another library, which records the field's type as any decorator does, and tells Drivine nothing. */
const Marked = (): PropertyDecorator => () => undefined;

@NodeFragment({ labels: ['HeldTag', 'Event'] })
class Event {
    @NodeId() id: string;
    @Marked() name?: string;
    @Marked() at?: Date;
    undecorated?: Date;
    undecoratedDays?: Date[];
    @NodeStamp() stamp?: string;
}

@NodeFragment({ labels: ['HeldTag', 'Person'] })
class Person {
    @NodeId() id: string;
    @Marked() name?: string;
}

@RelationshipFragment()
class Attendance {
    undecoratedSince?: Date;
    @TargetNode() event: Event;
}

@GraphView()
class Diary {
    @Root() person: Person;
    @GraphRelationship({ type: 'HELD_ATTENDS', target: () => Attendance }) attended: Attendance[];
}

/** The temporal properties the suite saves, as each node and edge holds them. */
const TEMPORALS = ['at', 'undecorated', 'undecoratedDays', 'undecoratedSince'];

/**
 * The JSON text each HeldTag node's properties are stored as, by id, and the HELD_ATTENDS edge's, under `edge`, as the
 * store gives it back: Oracle's re-encoded, as the thin driver can't read a document updated in place
 * (oracle/node-oracledb#1796).
 */
async function storedText(pm: PersistenceManager, store: SqlStore): Promise<Record<string, string>> {
    const [nodes, edges] =
        store.type === DatabaseType.ORACLE
            ? [
                  `SELECT JSON_VALUE(n.props, '$.id') AS "id", JSON_SERIALIZE(JSON_TRANSFORM(n.props, KEEP '$') RETURNING CLOB) AS "props" ` +
                      `FROM drivine_node n WHERE JSON_EXISTS(n.labels, '$?(@ == "HeldTag")')`,
                  `SELECT JSON_SERIALIZE(JSON_TRANSFORM(e.props, KEEP '$') RETURNING CLOB) AS "props" FROM drivine_edge e WHERE e.type = 'HELD_ATTENDS'`
              ]
            : store.type === DatabaseType.POSTGRES
            ? [
                  `SELECT n.props ->> 'id' AS "id", CAST(n.props AS text) AS "props" FROM drivine_node n WHERE n.labels @> '["HeldTag"]'`,
                  `SELECT CAST(e.props AS text) AS "props" FROM drivine_edge e WHERE e.type = 'HELD_ATTENDS'`
              ]
            : [
                  `SELECT n.props ->> '$.id' AS "id", n.props AS "props" FROM drivine_node n WHERE instr(n.labels, '"HeldTag"') > 0`,
                  `SELECT e.props AS "props" FROM drivine_edge e WHERE e.type = 'HELD_ATTENDS'`
              ];
    const rows = await pm.query<{ id: string; props: string }>(new QuerySpecification(nodes));
    const [edge] = await pm.query<{ props: string }>(new QuerySpecification(edges));
    return Object.fromEntries([...rows.map((it) => [it.id, it.props]), ['edge', edge.props]]);
}

/** Of each property `TEMPORALS` names in the stored JSON `text`, its JSON text, as the store holds it. */
function temporalsOf(text: string): Record<string, string> {
    const props = JSON.parse(text);
    return Object.fromEntries(
        TEMPORALS.filter((it) => props[it] !== undefined).map((it) => [it, JSON.stringify(props[it])])
    );
}

/**
 * A save of an object a SQL store loaded writes each temporal property it leaves unchanged as the store held it, byte
 * for byte (#811): the load gives an undecorated `Date` as its text, which was written over the date's tag before, and
 * a `Date` holds no nanoseconds and no offset, which a decorated field lost.
 */
describe.each(sqlStores())('a temporal property a save leaves as loaded, on $type', (store) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;

    beforeAll(async () => {
        pm = sqlPersistenceManager(store);
        gom = new StatelessGraphObjectManager(pm, backendFor(store.type), new ModelRegistry());
        if (store.type === DatabaseType.POSTGRES) {
            await pm.execute(new QuerySpecification(new PostgresGraph().ensuring));
        }
        if (store.type === DatabaseType.SQLITE) {
            await pm.execute(new QuerySpecification(new SqliteGraph().ensuring));
        }
    });

    beforeEach(async () => {
        await clearLabels(pm, store, 'HeldTag');
        await gom.save(
            Object.assign(new Diary(), {
                person: Object.assign(new Person(), { id: 'p', name: 'p' }),
                attended: [
                    Object.assign(new Attendance(), {
                        undecoratedSince: new Date('2025-12-01T00:00:00.000Z'),
                        event: Object.assign(new Event(), {
                            id: 'e1',
                            name: 'e1',
                            at: new Date('2026-01-01T00:00:00.123Z'),
                            undecorated: new Date('2026-01-01T00:00:00.000Z'),
                            undecoratedDays: [new Date('2026-01-02T00:00:00.000Z')]
                        })
                    })
                ]
            })
        );
        // Nanoseconds and an offset, which a Date holds neither of, as Cypher writes them.
        await pm.execute(
            new QuerySpecification({
                text:
                    "MATCH (n:HeldTag:Event {id: 'e1'}) SET n.at = datetime('2026-01-01T00:00:00.123456789+02:00'), " +
                    "n.undecoratedDays = [date('2026-01-02'), localdatetime('2026-01-01T10:11:12.5'), duration('P1DT2H')]",
                language: 'CYPHER'
            })
        );
    });

    afterAll(async () => {
        await clearLabels(pm, store, 'HeldTag');
        await closeGraphEngines();
    });

    const expectKept = (before: Record<string, string>, after: Record<string, string>): void => {
        for (const key of ['e1', 'edge']) {
            expect([key, temporalsOf(after[key])]).toEqual([key, temporalsOf(before[key])]);
        }
    };

    it('in a plain save of the node, another field changed', async () => {
        const before = await storedText(pm, store);
        const loaded = (await gom.load(Event, 'e1'))!;
        await gom.save(Object.assign(loaded, { name: 'resaved' }));
        const after = await storedText(pm, store);
        expectKept(before, after);
        expect(JSON.parse(after.e1).name).toEqual('resaved');
    });

    it("in a save of a changed copy given what it was loaded as, and in an update of the view, with the edge's", async () => {
        const before = await storedText(pm, store);
        const loaded = (await gom.load(Event, 'e1'))!;
        await gom.save(Object.assign(new Event(), loaded, { name: 'copied' }), { from: loaded });
        await gom.update(Diary, 'p', (it) => {
            it.person.name = 'updated';
        });
        const after = await storedText(pm, store);
        expectKept(before, after);
        expect(JSON.parse(after.p).name).toEqual('updated');
    });

    it('in a plain save of the view and a saveAll, and writes a value changed since the load afresh', async () => {
        const before = await storedText(pm, store);
        const diary = (await gom.load(Diary, 'p'))!;
        diary.person.name = 'resaved';
        await gom.save(diary);
        await gom.saveAll(await gom.loadAll(Event));
        expectKept(before, await storedText(pm, store));
        const loaded = (await gom.load(Event, 'e1'))!;
        loaded.undecorated = new Date('2026-02-01T00:00:00.000Z');
        await gom.save(loaded);
        const found = await gom.loadAll(Event, (q) => ({
            where: q.property('undecorated').eq(new Date('2026-02-01T00:00:00.000Z'))
        }));
        expect(found.map((it) => it.id)).toEqual(['e1']);
    });
});
