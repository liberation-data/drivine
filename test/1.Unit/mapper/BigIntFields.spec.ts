import {
    Aggregate,
    AggregateFunction,
    BigIntProperty,
    GraphObjectMapper,
    GraphRelationship,
    GraphView,
    JsonPacked,
    ModelRegistry,
    NodeFragment,
    NodeId,
    PropertyBag,
    RelationshipFragment,
    Root,
    TargetNode
} from '@liberation-data/drivine';

/** A decorator of another library, which records the field's type as any decorator does, and tells Drivine nothing. */
const Marked = (): PropertyDecorator => () => undefined;

const BIG = BigInt('9007199254740993');

/** Fields declared bigints in each way the model reads, and some it can't tell are. */
@NodeFragment({ labels: ['Metered'] })
class Metered {
    @NodeId() id: bigint;
    @BigIntProperty() union?: bigint | null;
    @BigIntProperty() nested?: any;
    @BigIntProperty() @PropertyBag() bag: Record<string, any> = {};
    @BigIntProperty() @JsonPacked() packed?: any;
    initialized: bigint = BigInt(0);
    @Marked() undecoratedUnion?: bigint | null;
    plain?: any;
}

@RelationshipFragment()
class Metering {
    /** Declared so only to another library's decorator: TypeScript records it, which the load reads. */
    @Marked() since: bigint;
    weight?: number;
    @TargetNode() target: Metered;
}

@GraphView()
class MeteredView {
    @Root() root: Metered;
    @GraphRelationship({ type: 'METERS', target: () => Metering }) meterings: Metering[];
    @Aggregate({ function: AggregateFunction.SUM, type: 'METERS', property: 'plain' }) total: number;
    @Aggregate({ function: AggregateFunction.SUM, type: 'METERS', property: 'plain' }) exact: bigint;
}

describe('A field declared a bigint', () => {
    const registry = new ModelRegistry();
    const mapper = new GraphObjectMapper();
    const props = (): Record<string, any> => ({
        id: 7,
        union: BIG,
        nested: { list: [1, [2.5, BIG]], date: new Date(0) },
        'bag.count': 3,
        packed: '{"deep":[9007199254740993, 1.5]}',
        initialized: 4,
        undecoratedUnion: 5,
        plain: { list: [BIG, 6] }
    });
    const row = () => ({ props: props(), labels: ['Metered'] });

    it('should be known to the model by TypeScript, by its initializer or by @BigIntProperty, and not otherwise', () => {
        expect(Reflect.getMetadata('design:type', Metered.prototype, 'undecoratedUnion')).toBe(Object);
        expect([...registry.fragment(Metered).bigInts].sort()).toEqual([
            'bag',
            'id',
            'initialized',
            'nested',
            'packed',
            'union'
        ]);
    });

    it('should load its whole numbers as bigints at any depth, and leave fractions and dates as they are', () => {
        const loaded = mapper.fragment<Metered>(registry.fragment(Metered), row());
        expect(loaded.id).toBe(BigInt(7));
        expect(loaded.union).toBe(BIG);
        expect(loaded.nested.list).toEqual([BigInt(1), [2.5, BIG]]);
        expect(loaded.nested.date).toEqual(new Date(0));
        expect(loaded.bag).toEqual({ count: BigInt(3) });
        expect(loaded.packed).toEqual({ deep: [BIG, 1.5] });
        expect(loaded.initialized).toBe(BigInt(4));
    });

    it('should leave any other field a number, past 2^53 the nearest', () => {
        const loaded = mapper.fragment<Metered>(registry.fragment(Metered), row());
        expect(loaded.undecoratedUnion).toBe(5);
        expect(loaded.plain).toEqual({ list: [Number(BIG), 6] });
    });

    it("should load as declared in a view's relationship fragment and its aggregates", () => {
        const view = mapper.view<MeteredView>(registry.view(MeteredView), {
            root: row(),
            rels: {
                meterings: [{ rel: { since: 8, weight: BIG }, target: row() }],
                total: BIG,
                exact: 9
            }
        });
        expect(view.root.union).toBe(BIG);
        expect(view.meterings[0].since).toBe(BigInt(8));
        expect(view.meterings[0].weight).toBe(Number(BIG));
        expect(view.meterings[0].target.id).toBe(BigInt(7));
        expect(view.total).toBe(Number(BIG));
        expect(view.exact).toBe(BigInt(9));
    });
});
