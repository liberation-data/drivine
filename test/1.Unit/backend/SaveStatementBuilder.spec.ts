import {
    EmptyWhenAbsent,
    FALKORDB_GRAMMAR,
    GraphProperty,
    GraphRelationship,
    GraphView,
    JsonPacked,
    MEMGRAPH_GRAMMAR,
    ModelRegistry,
    NEO4J_GRAMMAR,
    NodeFragment,
    NodeId,
    NodeLabels,
    NodeStamp,
    NullPolicy,
    PropertyBag,
    Root,
    VectorIndex,
    SaveStatementBuilder
} from '@liberation-data/drivine';
import { CypherGrammar } from '@/backend/CypherGrammar';
import { bagEntries } from '@/backend/SaveStatementBuilder';

@NodeFragment({ labels: ['Person'] })
class Person {
    @NodeId() id: string;
    name?: string;
}

@NodeFragment({ labels: ['Anonymous'] })
class Anonymous {
    name: string;
}

@GraphView()
class Team {
    @Root() lead: Person;
    @GraphRelationship({ type: 'HAS', target: () => Person }) members: Person[];
}

@GraphView()
class Org {
    @Root() head: Person;
    @GraphRelationship({ type: 'RUNS', target: () => Team }) teams: Team[];
}

@NodeFragment({ labels: ['Sticker'] })
class Sticker {
    @NodeId() id: string;
    @GraphProperty('sticker_name') name?: string;
    @PropertyBag({ prefix: 'meta', delimiter: '_' }) meta: Record<string, any> = {};
    @PropertyBag({ flat: true }) extras: Record<string, any> = {};
}

@GraphView()
class Album {
    @Root() owner: Person;
    @GraphRelationship({ type: 'HOLDS', target: () => Sticker }) stickers: Sticker[];
}

@NodeFragment({ labels: ['Claim'] })
class Claim {
    @NodeId() id: string;
    text?: string;
    note?: string;
    status = 'open';
    @NodeStamp() stamp?: string;
}

@NodeFragment({ labels: ['Tagged'] })
class Tagged {
    @NodeId() id: string;
    text?: string;
    @PropertyBag() meta: Record<string, any> = {};
    @NodeStamp() stamp?: string;
}

/** A flat bag and an open set of labels beside a stamp. */
@NodeFragment({ labels: ['Badge'] })
class Badge {
    @NodeId() id: string;
    @NodeLabels() labels: string[] = [];
    @PropertyBag({ flat: true }) extras: Record<string, any> = {};
    @NodeStamp() stamp?: string;
}

enum Shade {
    RED = 'Red',
    GREEN = 'Green',
    BLUE = 'Blue'
}

/** A closed set of labels: the field speaks for the Shade labels and no other. */
@NodeFragment({ labels: ['Swatch'] })
class Swatch {
    @NodeId() id: string;
    @NodeLabels(Shade) shades: Set<string> = new Set();
    @NodeStamp() stamp?: string;
}

/** A renamed field, a packed one, and fields a load gives an empty collection when the node holds none. */
@NodeFragment({ labels: ['Note'] })
class Note {
    @NodeId() id: string;
    @GraphProperty('a_title') title?: string;
    body?: string;
    @JsonPacked() extra?: Record<string, any>;
    @EmptyWhenAbsent() tags: string[];
    @EmptyWhenAbsent() attrs: Record<string, any>;
    @NodeStamp() stamp?: string;
}

/** A vector field, which the engine may store in a type of its own. */
@NodeFragment({ labels: ['Chunk'] })
class Chunk {
    @NodeId() id: string;
    @VectorIndex({ dimensions: 2 }) embedding?: number[];
    @NodeStamp() stamp?: string;
}

const STAMP = '0123456789abcdef:fedcba9876543210';

describe('SaveStatementBuilder', () => {
    const registry = new ModelRegistry();
    const fragment = (type: any) => ({ kind: 'NODE_FRAGMENT' as const, model: registry.fragment(type) });
    const view = { kind: 'GRAPH_VIEW' as const, model: registry.view(Team) };
    const person = (id: string) => Object.assign(new Person(), { id });

    it('should merge a fragment on its id and set its properties that are not null', () => {
        const statement = new SaveStatementBuilder(NEO4J_GRAMMAR).build(
            fragment(Person),
            Object.assign(new Person(), { id: 'p', name: undefined })
        );
        expect(statement.text).toMatch(/^MERGE \(n:Person \{id: \$root.id\}\) ON CREATE SET/);
        expect(statement.text).toContain('SET n += $root.props');
        expect(statement.text).toMatch(/RETURN {found: _found, now: n.`__drivine.stamp`} AS result$/);
        expect(statement.bindings.root).toEqual({ id: 'p', props: { id: 'p' }, vectors: {} });
        expect(statement.bindings._stamp).toMatch(/^[0-9a-f]{16}:[0-9a-f]{16}$/);
        expect(statement.expectedStamp).toBeUndefined();
    });

    it('should refuse a node without an id', () => {
        expect(() => new SaveStatementBuilder(NEO4J_GRAMMAR).build(fragment(Person), new Person())).toThrow(
            /has no id/
        );
        expect(() => new SaveStatementBuilder(NEO4J_GRAMMAR).build(fragment(Anonymous), new Anonymous())).toThrow(
            /Anonymous has no @NodeId property/
        );
    });

    it('should refuse replace on a fragment, of a field that is not a relationship, or of a missing list', () => {
        const builder = (): SaveStatementBuilder => new SaveStatementBuilder(NEO4J_GRAMMAR);
        expect(() => builder().build(fragment(Person), person('p'), { replace: ['name'] })).toThrow(
            /is a @NodeFragment/
        );
        const team = Object.assign(new Team(), { lead: person('l'), members: [] });
        expect(() => builder().build(view, team, { replace: ['lead'] })).toThrow(/not a relationship field/);
        expect(() => builder().build(view, { ...team, members: undefined }, { replace: ['members'] })).toThrow(
            /Give an empty list/
        );
    });

    it('should keep, when replacing a list of views, the views whose roots the object holds', () => {
        const team = Object.assign(new Team(), { lead: person('t1'), members: [] });
        const org = Object.assign(new Org(), { head: person('h'), teams: [team] });
        const statement = new SaveStatementBuilder(NEO4J_GRAMMAR).build(
            { kind: 'GRAPH_VIEW', model: registry.view(Org) },
            org,
            { replace: ['teams'] }
        );
        expect(Object.entries(statement.bindings).find(([key]) => key.startsWith('keep'))?.[1]).toEqual(['t1']);
    });

    it('should write the rows of a relationship as a parameter, so the text does not grow with the list', () => {
        const one = new SaveStatementBuilder(NEO4J_GRAMMAR).build(
            view,
            Object.assign(new Team(), { lead: person('l'), members: [person('a')] })
        );
        const two = new SaveStatementBuilder(NEO4J_GRAMMAR).build(
            view,
            Object.assign(new Team(), { lead: person('l'), members: [person('a'), person('b')] })
        );
        expect(two.text).toEqual(one.text);
        expect(two.bindings.rows1).toEqual([
            { id: 'a', props: { id: 'a' }, vectors: {} },
            { id: 'b', props: { id: 'b' }, vectors: {} }
        ]);
    });

    it('should refuse a flat bag entry another bag is stored under, though except leaves that bag out', () => {
        const model = registry.fragment(Sticker);
        const sticker = (extras: Record<string, any>) => Object.assign(new Sticker(), { id: 's', extras });
        const keep = (field: string): boolean => field !== 'meta';
        expect(() => bagEntries(model, sticker({ meta_lang: 'en' }), [], false, keep)).toThrow(
            /Sticker.extras has an entry 'meta_lang', which is the property of a declared field or of another bag/
        );
        expect(bagEntries(model, sticker({ sticker_name: null, size: 3 }))).toEqual(new Map([['size', 3]]));
    });

    it("should refuse a related node's flat bag entry that its field is stored under", () => {
        const sticker = Object.assign(new Sticker(), { id: 's', extras: { sticker_name: 'x' } });
        const album = Object.assign(new Album(), { owner: person('o'), stickers: [sticker] });
        expect(() =>
            new SaveStatementBuilder(NEO4J_GRAMMAR).build({ kind: 'GRAPH_VIEW', model: registry.view(Album) }, album)
        ).toThrow(/Sticker.extras has an entry 'sticker_name'/);
    });

    type Check = { check: string; bindings: Record<string, any> };
    /** The check of the save of `changed`, as update saves it with `loaded`: the root's `_ok`, and what it binds. */
    const checkOfChange = <T extends object>(loaded: T, changed: T, grammar: CypherGrammar = NEO4J_GRAMMAR): Check => {
        const statement = new SaveStatementBuilder(grammar).build(fragment(loaded.constructor), changed, {
            nullPolicy: NullPolicy.CLEAR,
            loaded
        });
        return {
            check: statement.text.split('\n').find((it) => it.endsWith(' AS _ok'))!,
            bindings: statement.bindings
        };
    };
    const claim = (text: string): Claim =>
        Object.assign(new Claim(), { id: 'c1', text, note: undefined, stamp: STAMP });

    it('should match the node, where a read takes no snapshot, only while each field is as it was loaded', () => {
        const { check, bindings }: Check = checkOfChange(claim('one'), claim('two'));

        expect(check).toEqual(
            'WITH n, coalesce(left(n.`__drivine.stamp`, 16) = left($_expected, 16) AND n.note IS NULL AND ' +
                'NOT coalesce(n.status <> $_loaded1, false) AND ' +
                'n.text IS NOT NULL AND NOT coalesce(n.text <> $_loaded2, false), false) AS _ok'
        );
        expect(bindings._loaded2).toEqual('one');
        expect(bindings._loaded1).toEqual('open');
        expect(checkOfChange(claim('a longer text'), claim('two')).check).toEqual(check);
    });

    it('should hold a field to what it was loaded with, a value a load gives an absent property aside', () => {
        const loaded = Object.assign(claim('one'), { status: 'closed' });
        const { check }: Check = checkOfChange(loaded, claim('two'));

        expect(check).toContain('n.status IS NOT NULL AND NOT coalesce(n.status <> $_loaded1, false)');
        expect(check).toContain('n.note IS NULL');
    });

    it('should bind null, which no comparison refuses, for a loaded value the store cannot be handed back', () => {
        const seen = new Date();
        const loaded = Object.assign(claim('one'), { note: seen });
        const { check, bindings }: Check = checkOfChange(loaded, claim('two'));
        expect(check).toContain('n.note IS NOT NULL AND NOT coalesce(n.note <> $_loaded0, false)');
        expect(bindings._loaded0).toBeNull();

        const tagged = Object.assign(new Tagged(), { id: 't1', meta: { owner: 'ada', seen }, stamp: STAMP });
        const bagged: Check = checkOfChange(tagged, Object.assign(new Tagged(), { ...tagged, text: 'two' }));
        expect(bagged.bindings._loadedBag0).toEqual({ 'meta.owner': 'ada', 'meta.seen': null });
    });

    it('should compare a field under its stored name, packed as it is stored, and an empty collection as maybe absent', () => {
        const loaded = Object.assign(new Note(), {
            id: 'n1',
            title: 'T',
            body: 'B',
            extra: { x: 1 },
            tags: [],
            attrs: {},
            stamp: STAMP
        });
        const { check, bindings }: Check = checkOfChange(loaded, Object.assign(new Note(), { ...loaded, body: 'C' }));

        expect(check).toContain(
            'n.a_title IS NOT NULL AND NOT coalesce(n.a_title <> $_loaded0, false) AND ' +
                'NOT coalesce(n.attrs <> $_loaded1, false) AND ' +
                'n.body IS NOT NULL AND NOT coalesce(n.body <> $_loaded2, false) AND ' +
                'n.extra IS NOT NULL AND NOT coalesce(n.extra <> $_loaded3, false) AND ' +
                'NOT coalesce(n.tags <> $_loaded4, false), false) AS _ok'
        );
        expect([bindings._loaded0, bindings._loaded3, bindings._loaded4]).toEqual(['T', '{"x":1}', []]);
    });

    it('should compare a packed field as the text the load read, and pack one the node held none for', () => {
        const loaded = Object.assign(new Note(), { id: 'n1', extra: { a: 1 }, stamp: STAMP });
        const changed = Object.assign(new Note(), { ...loaded, body: 'C' });
        const packed = (loadedProperties: Record<string, any>): any[] => {
            const bindings = new SaveStatementBuilder(NEO4J_GRAMMAR).build(fragment(Note), changed, {
                nullPolicy: NullPolicy.CLEAR,
                loaded,
                loadedProperties
            }).bindings;
            return Object.entries(bindings)
                .filter(([key, value]) => key.startsWith('_loaded') && String(value).includes('"a"'))
                .map(([, value]) => value);
        };

        expect(packed({ id: 'n1', extra: '{"a": 1}' })).toEqual(['{"a": 1}']);
        expect(packed({ id: 'n1' })).toEqual(['{"a":1}']);
    });

    it('should compare a vector field as the engine stores a vector', () => {
        const typed: CypherGrammar = { ...NEO4J_GRAMMAR, vectorValue: (it) => `toVector(${it})` };
        const loaded = Object.assign(new Chunk(), { id: 'k1', embedding: [0.5, 1], stamp: STAMP });
        const { check, bindings }: Check = checkOfChange(
            loaded,
            Object.assign(new Chunk(), { ...loaded, embedding: [1, 0] }),
            typed
        );

        expect(check).toContain('n.embedding IS NOT NULL AND NOT coalesce(n.embedding <> toVector($_loaded0), false)');
        expect(bindings._loaded0).toEqual([0.5, 1]);
    });

    it('should compare the stamp alone where a read takes a snapshot, or the object was not loaded by update', () => {
        for (const grammar of [MEMGRAPH_GRAMMAR, FALKORDB_GRAMMAR]) {
            const { check, bindings }: Check = checkOfChange(claim('one'), claim('two'), grammar);
            expect(check).not.toContain('_loaded');
            expect(Object.keys(bindings).filter((it) => it.startsWith('_loaded'))).toEqual([]);
        }
        const saved = new SaveStatementBuilder(NEO4J_GRAMMAR).build(fragment(Claim), claim('two'));
        expect(saved.text).not.toContain('_loaded');
    });

    it('should hold a prefixed bag to the keys and values it was loaded with', () => {
        const loaded = Object.assign(new Tagged(), { id: 't1', text: 'one', meta: { owner: 'ada' }, stamp: STAMP });
        const { check, bindings }: Check = checkOfChange(
            loaded,
            Object.assign(new Tagged(), { ...loaded, text: 'two' })
        );

        expect(check).toContain(
            'size([k IN keys(n) WHERE k STARTS WITH $_loadedBag0Prefix]) = size(keys($_loadedBag0)) AND ' +
                'all(k IN keys($_loadedBag0) WHERE n[k] IS NOT NULL AND NOT coalesce(n[k] <> $_loadedBag0[k], false))'
        );
        expect(bindings._loadedBag0).toEqual({ 'meta.owner': 'ada' });
        expect(bindings._loadedBag0Prefix).toEqual('meta.');
    });

    it('should hold a flat bag and an open set of labels to what they were loaded with', () => {
        const loaded = Object.assign(new Badge(), { id: 'b1', labels: ['Shiny'], extras: { size: 1 }, stamp: STAMP });
        const { check, bindings }: Check = checkOfChange(
            loaded,
            Object.assign(new Badge(), { ...loaded, extras: { size: 2 } })
        );

        expect(check).toContain(
            'size([k IN keys(n) WHERE NOT k IN $_loadedBag0Reserved AND ' +
                'none(p IN $_loadedBag0ReservedPrefixes WHERE k STARTS WITH p)]) = size(keys($_loadedBag0))'
        );
        expect(bindings._loadedBag0).toEqual({ size: 1 });
        expect(bindings._loadedBag0Reserved).toEqual(expect.arrayContaining(['id', 'stamp', 'labels', 'extras']));
        expect(bindings._loadedBag0ReservedPrefixes).toEqual(['__drivine.']);
        expect(check).toContain(
            'size([l IN labels(n) WHERE NOT l IN $_loadedLabelsOwn]) = size($_loadedLabels) AND ' +
                'all(l IN $_loadedLabels WHERE l IN labels(n))'
        );
        expect([bindings._loadedLabels, bindings._loadedLabelsOwn]).toEqual([['Shiny'], ['Badge']]);
    });

    it('should hold a closed set of labels to its own members alone', () => {
        const loaded = Object.assign(new Swatch(), { id: 'w1', shades: new Set([Shade.BLUE]), stamp: STAMP });
        const changed = Object.assign(new Swatch(), { ...loaded, shades: new Set([Shade.RED]) });
        const { check, bindings }: Check = checkOfChange(loaded, changed);

        expect(check).toContain('size([l IN labels(n) WHERE l IN $_loadedLabelsClosed]) = size($_loadedLabels)');
        expect(bindings._loadedLabelsClosed).toEqual(['Red', 'Green', 'Blue']);
        expect(bindings._loadedLabels).toEqual(['Blue']);
    });
});
