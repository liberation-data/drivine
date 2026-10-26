import {
    backendFor,
    DatabaseType,
    GraphRelationship,
    GraphView,
    ModelRegistry,
    NodeFragment,
    NodeId,
    NodeLabels,
    PersistenceManager,
    PostgresGraph,
    QuerySpecification,
    RelationshipFragment,
    Root,
    StatelessGraphObjectManager,
    TargetNode
} from '@liberation-data/drivine';
import { allStores, clearLabels, closeGraphEngines, persistenceManagerFor } from '../support/GraphEngines';

// Neo4j plans each statement the first time it sees it, a few hundred milliseconds for one of the object manager's, and
// the tests here send statements of their own shapes. On fresh containers, beside the suites running in parallel, a
// test can pass Jest's 5 seconds planning them (#349).
jest.setTimeout(30_000);

// Oracle writes a save in one PL/SQL block, whose VARCHAR2 parameters hold 32,767 bytes at most, and a JSON_SERIALIZE
// that doesn't say otherwise 4,000: these texts are past each, in characters and in bytes.
const ASCII = 'x'.repeat(40_000);
const ACCENTED = 'é'.repeat(20_000);
const PAST_4000 = 'y'.repeat(5_000);
const LENGTHS: [string, string][] = [
    ['past 4,000 bytes', PAST_4000],
    ['past 32 KB', ASCII]
];

@NodeFragment({ labels: ['LongText', 'Person'] })
class Person {
    @NodeId() uuid: string;
    name?: string;
    bio?: string;
}

@NodeFragment({ labels: ['LongText', 'Tagged'] })
class Tagged {
    @NodeId() uuid: string;
    @NodeLabels() tags: string[] = [];
    bio?: string;
}

@RelationshipFragment()
class Note {
    text: string;
    @TargetNode() person: Person;
}

@GraphView()
class Notes {
    @Root() person: Person;
    @GraphRelationship({ type: 'NOTED', target: () => Note }) notes: Note[];
}

const person = (uuid: string, bio?: string): Person => Object.assign(new Person(), { uuid, name: uuid, bio });

/** Every store saves, patches and loads back a text of any length, as Oracle once failed to past 4,000 or 32,767 bytes. */
describe.each(allStores())('long text on $type', (engine) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    const bio = async (uuid: string): Promise<string | undefined> => (await gom.load(Person, uuid))?.bio;

    beforeAll(async () => {
        pm = persistenceManagerFor(engine);
        gom = new StatelessGraphObjectManager(pm, backendFor(engine.type), new ModelRegistry());
        if (engine.type === DatabaseType.POSTGRES) {
            await pm.execute(new QuerySpecification(new PostgresGraph().ensuring));
        }
    });

    beforeEach(async () => {
        await clearLabels(pm, engine, 'LongText');
    });

    afterAll(async () => {
        await clearLabels(pm, engine, 'LongText');
        await closeGraphEngines();
    });

    it('should save and load a property of 40,000 characters', async () => {
        await gom.save(person('p1', ASCII));
        expect(await bio('p1')).toEqual(ASCII);
    });

    it('should save and load a property of 40,000 bytes in 20,000 characters', async () => {
        await gom.save(person('p1', ACCENTED));
        expect(await bio('p1')).toEqual(ACCENTED);
    });

    it('should save several such nodes at once', async () => {
        await gom.saveAll([person('p1', ASCII), person('p2', ACCENTED), person('p3', 'z'.repeat(50_000))]);
        expect([(await bio('p1'))?.length, await bio('p2'), (await bio('p3'))?.length]).toEqual([
            40_000,
            ACCENTED,
            50_000
        ]);
    });

    it('should grow a property past 32 KB, by save and by update', async () => {
        await gom.save(person('p1', 'short'));
        await gom.save(person('p1', ASCII));
        expect(await bio('p1')).toEqual(ASCII);

        await gom.save(person('p2', 'short'));
        await gom.update(Person, 'p2', (it) => {
            it.bio = ACCENTED;
        });
        expect(await bio('p2')).toEqual(ACCENTED);
    });

    it.each(LENGTHS)('should patch a property %s', async (_, text) => {
        await gom.save(person('p1', 'short'));
        expect(await gom.patch(Person, 'p1', { set: { bio: text } })).toEqual({
            found: true,
            applied: true,
            changed: true
        });
        expect(await bio('p1')).toEqual(text);
    });

    it.each(LENGTHS)('should patchAll a property %s', async (_, text) => {
        await gom.saveAll([person('p1', 'short'), person('p2', 'short')]);
        const results = await gom.patchAll([person('p1', text), person('p2', ACCENTED)], { only: ['bio'] });
        expect(results.map((it) => it.changed)).toEqual([true, true]);
        expect([await bio('p1'), await bio('p2')]).toEqual([text, ACCENTED]);
    });

    it("should save and load a relationship's property, and its related node's, past 32 KB", async () => {
        const note = Object.assign(new Note(), { text: ACCENTED, person: person('p2', ASCII) });
        await gom.save(Object.assign(new Notes(), { person: person('p1'), notes: [note] }));
        const loaded = (await gom.load(Notes, 'p1'))!;
        expect(loaded.notes.map((it) => it.text)).toEqual([ACCENTED]);
        expect(await bio('p2')).toEqual(ASCII);
    });

    it("should grow a relationship's property past 32 KB when saved again", async () => {
        const notes = (text: string): Notes =>
            Object.assign(new Notes(), {
                person: person('p1'),
                notes: [Object.assign(new Note(), { text, person: person('p2') })]
            });
        await gom.save(notes('short'));
        await gom.save(notes(ACCENTED));
        expect((await gom.load(Notes, 'p1'))!.notes.map((it) => it.text)).toEqual([ACCENTED]);
    });

    it('should record an open label field on a node holding more than 4,000 bytes', async () => {
        await gom.save(Object.assign(new Tagged(), { uuid: 't1', tags: ['Red'], bio: PAST_4000 }));
        await gom.save(Object.assign(new Tagged(), { uuid: 't2', tags: ['Blue'], bio: ASCII }));
        const loaded = [(await gom.load(Tagged, 't1'))!, (await gom.load(Tagged, 't2'))!];
        expect(loaded.map((it) => [it.tags, it.bio?.length])).toEqual([
            [['Red'], 5_000],
            [['Blue'], 40_000]
        ]);
    });
});
