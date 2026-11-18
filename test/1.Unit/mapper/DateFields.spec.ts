import {
    GraphObjectMapper,
    GraphPath,
    GraphProperty,
    GraphRelationship,
    GraphView,
    ModelRegistry,
    NodeFragment,
    NodeId,
    RelationshipFragment,
    Root,
    TargetNode
} from '@liberation-data/drivine';

/** A decorator of another library, which records the field's type as any decorator does, and tells Drivine nothing. */
const Marked = (): PropertyDecorator => () => undefined;

const AT = new Date('2026-01-01T00:00:00.000Z');

/**
 * Date fields declared in each way the model reads (#785), and some it can't tell from a text: one declared with a union,
 * which TypeScript records as Object, and one undecorated, which it records no type of.
 */
@NodeFragment({ labels: ['Dated'] })
class Dated {
    @NodeId() id: string;
    @Marked() at?: Date;
    @GraphProperty('due_at') due?: Date;
    initialized: Date = new Date(0);
    @Marked() union?: Date | null;
    undecorated?: Date;
    @Marked() name?: string;
}

/** Inherits its parent's Date fields. */
@NodeFragment({ labels: ['Dated', 'Special'] })
class Special extends Dated {
    @Marked() since?: Date;
}

/** A node whose id is a Date. */
@NodeFragment({ labels: ['Day'] })
class Day {
    @NodeId() id: Date;
}

@RelationshipFragment()
class Dating {
    @Marked() since?: Date;
    @GraphProperty('until_at') until?: Date;
    @TargetNode() target: Dated;
}

@GraphView()
class DatedView {
    @Root() root: Dated;
    @GraphRelationship({ type: 'NEXT', target: () => Dated }) next?: Dated;
    @GraphRelationship({ type: 'FOLLOWS', target: () => Dated }) followers: Dated[];
}

@GraphView()
class DatedHolder {
    @Root() root: Dated;
    @GraphRelationship({ type: 'HOLDS' }) view?: DatedView;
    @GraphRelationship({ type: 'DATES', target: () => Dating }) datings: Dating[];
    @GraphRelationship({ type: 'DATES_ONE', target: () => Dating }) dating?: Dating;
    @GraphPath([{ type: 'HOLDS' }, { type: 'NEXT' }], { target: () => Dated }) far: Dated[];
}

/**
 * Each store's row of a moment: the SQL stores give the tag's text, SQLite and Postgres as the module reads it and
 * Oracle as its `v`, FalkorDB the text with nine digits of the second it holds, Cypher's grouped text has no fraction,
 * and Neo4j's and Memgraph's drivers give a Date.
 */
const ROW_SHAPES: [string, any][] = [
    ['SQLite, Postgres and Oracle', '2026-01-01T00:00:00.000Z'],
    ["Cypher's text, with no fraction", '2026-01-01T00:00:00Z'],
    ['FalkorDB', '2026-01-01T00:00:00.000000000Z'],
    ['an offset', '2026-01-01T02:00:00+02:00'],
    ['Neo4j and Memgraph', new Date(AT.getTime())]
];

describe('A field declared a Date (#807)', () => {
    const registry = new ModelRegistry();
    const mapper = new GraphObjectMapper();
    const props = (id: string, at: any): Record<string, any> => ({
        id,
        at,
        due_at: at,
        initialized: at,
        union: at,
        undecorated: at,
        name: '2026-01-01'
    });
    const row = (id: string, at: any) => ({ props: props(id, at), labels: ['Dated'] });

    const expectDates = (dated: Dated, given: any): void => {
        for (const field of ['at', 'due', 'initialized'] as const) {
            expect([field, dated[field]]).toEqual([field, AT]);
            expect(dated[field]).toBeInstanceOf(Date);
        }
        // Not declared a Date where TypeScript records it: as the store gives it.
        expect(dated.union).toEqual(given);
        expect(dated.undecorated).toEqual(given);
        // A text field holding a date's text stays a text.
        expect(dated.name).toEqual('2026-01-01');
    };

    it("should be known by Drivine's decorator's type, by the initializer and from the parent, and another library's by its type", () => {
        // A field only another library's decorator marks isn't in the model: the load reads the type TypeScript records.
        expect([...registry.fragment(Dated).dates].sort()).toEqual(['due', 'initialized']);
        expect([...registry.fragment(Special).dates].sort()).toEqual(['due', 'initialized']);
        expect([...registry.relationshipFragment(Dating).dates]).toEqual(['until']);
        for (const [type, field] of [
            [Dated, 'at'],
            [Special, 'since'],
            [Dating, 'since']
        ] as const) {
            expect(Reflect.getMetadata('design:type', type.prototype, field)).toBe(Date);
        }
        expect(Reflect.getMetadata('design:type', Dated.prototype, 'union')).toBe(Object);
        expect(Reflect.getMetadata('design:type', Dated.prototype, 'undecorated')).toBeUndefined();
    });

    it.each(ROW_SHAPES)('should load a fragment as a Date from the row of %s', (_, at) => {
        expectDates(mapper.fragment<Dated>(registry.fragment(Dated), row('d1', at)), at);
    });

    it.each(ROW_SHAPES)('should load a subclass, and the field it adds, as a Date from the row of %s', (_, at) => {
        const special = mapper.fragment<Special>(registry.fragment(Special), {
            props: { ...props('s1', at), since: at },
            labels: ['Dated', 'Special']
        });
        expect(special).toBeInstanceOf(Special);
        expectDates(special, at);
        expect(special.since).toEqual(AT);
    });

    it.each(ROW_SHAPES)(
        "should load a view's root, its relationships, a nested view, a relationship fragment and a path's end as Dates from the row of %s",
        (_, at) => {
            const holder = mapper.view<DatedHolder>(registry.view(DatedHolder), {
                root: row('root', at),
                rels: {
                    view: {
                        root: row('nested', at),
                        rels: { next: row('next', at), followers: [row('follower', at)] }
                    },
                    datings: [{ rel: { since: at, until_at: at }, target: row('target', at) }],
                    dating: { rel: { since: at, until_at: at }, target: row('one', at) },
                    far: [row('far', at)]
                }
            });
            expectDates(holder.root, at);
            expectDates(holder.view!.root, at);
            expectDates(holder.view!.next!, at);
            expectDates(holder.view!.followers[0], at);
            for (const dating of [holder.datings[0], holder.dating!]) {
                expect([dating.since, dating.until]).toEqual([AT, AT]);
                expect(dating.since).toBeInstanceOf(Date);
                expectDates(dating.target, at);
            }
            expectDates(holder.far[0], at);
        }
    );

    it('should load a renamed field by its stored name, and leave a property of its field name as no field of it', () => {
        const dated = mapper.fragment<Dated>(registry.fragment(Dated), {
            props: { id: 'd1', due: '2026-01-01T00:00:00Z' },
            labels: ['Dated']
        });
        expect(dated.due).toBeUndefined();
    });

    it('should load a Date id as a Date, from its text or a driver Date', () => {
        for (const id of ['2026-01-01T00:00:00.000Z', '2026-01-01', AT]) {
            const day = mapper.fragment<Day>(registry.fragment(Day), { props: { id }, labels: ['Day'] });
            expect(day.id).toBeInstanceOf(Date);
            expect(day.id).toEqual(AT);
        }
    });

    it("should leave a null, an absent value and a text a Date can't hold as the store gives it", () => {
        const load = (at: any): Dated =>
            mapper.fragment<Dated>(registry.fragment(Dated), { props: { id: 'd1', at }, labels: ['Dated'] });
        expect(load(null).at).toBeNull();
        expect(load(undefined).at).toBeUndefined();
        expect(mapper.fragment<Dated>(registry.fragment(Dated), { props: { id: 'd1' }, labels: ['Dated'] }).at).toBe(
            undefined
        );
        for (const text of ['5', 'soon', '2026-02-30T00:00:00Z', '2026-01-01T24:00:00Z', '']) {
            expect(load(text).at).toEqual(text);
        }
        expect(load(7).at).toEqual(7);
        // The initializer is kept where the node holds nothing for the field.
        expect(load(null).initialized).toEqual(new Date(0));
    });

    it("should give a driver's Date as another Date of the same instant, so a change to the loaded one leaves the row's alone", () => {
        const given = new Date(AT.getTime());
        const dated = mapper.fragment<Dated>(registry.fragment(Dated), row('d1', given));
        expect(dated.at).toEqual(given);
        dated.at!.setTime(0);
        expect(given).toEqual(AT);
    });
});
