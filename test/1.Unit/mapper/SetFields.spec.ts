import {
    GraphObjectMapper,
    GraphPath,
    GraphProperty,
    GraphRelationship,
    GraphView,
    JsonPacked,
    ModelRegistry,
    NEO4J_GRAMMAR,
    NodeFragment,
    NodeId,
    RelationshipFragment,
    Root,
    SaveStatementBuilder,
    TargetNode
} from '@liberation-data/drivine';

/** A decorator of another library, which records the field's type as any decorator does, and tells Drivine nothing. */
const Marked = (): PropertyDecorator => () => undefined;

/**
 * Set fields without `@EmptyWhenAbsent`, each declared in a way Drivine can tell is a Set: TypeScript records the type
 * of a decorated field, and the class initializes another with one. And two it can't tell from a list.
 */
@NodeFragment({ labels: ['Coded'] })
class Coded {
    @NodeId() id: string;
    @GraphProperty('code_set') codes: Set<string>;
    @JsonPacked() packed?: Set<number>;
    @Marked() marked: Set<string>;
    initialized = new Set<string>();
    @Marked() initializedUnion: Set<string> | null = new Set<string>();
    @Marked() union: Set<string> | null;
    undecorated: Set<string>;
    list: string[];
}

@RelationshipFragment()
class Coding {
    @Marked() reasons: Set<string>;
    @TargetNode() target: Coded;
}

@GraphView()
class CodedView {
    @Root() root: Coded;
    @GraphRelationship({ type: 'CODES', target: () => Coded }) related: Coded[];
}

@GraphView()
class CodedHolder {
    @Root() root: Coded;
    @GraphRelationship({ type: 'HOLDS' }) view?: CodedView;
    @GraphRelationship({ type: 'CODES', target: () => Coding }) codings: Coding[];
    @GraphPath([{ type: 'CODES' }, { type: 'CODES' }], { target: () => Coded }) far: Coded[];
}

describe('A Set field without @EmptyWhenAbsent', () => {
    const registry = new ModelRegistry();
    const mapper = new GraphObjectMapper();
    const props = (id: string): Record<string, any> => ({
        id,
        code_set: ['a', 'b'],
        packed: '[1, 2]',
        marked: ['m'],
        initialized: ['i'],
        initializedUnion: ['u'],
        union: ['n'],
        undecorated: ['d'],
        list: ['l']
    });
    const row = (id: string) => ({ props: props(id), labels: ['Coded'] });
    const load = (fields: Record<string, any>): Coded =>
        mapper.fragment<Coded>(registry.fragment(Coded), { props: { id: 'c1', ...fields }, labels: ['Coded'] });

    const expectSets = (coded: Coded): void => {
        expect(coded.codes).toBeInstanceOf(Set);
        expect(coded.codes.has('a')).toBe(true);
        expect(coded.codes).toEqual(new Set(['a', 'b']));
        expect(coded.packed).toEqual(new Set([1, 2]));
        expect(coded.marked).toEqual(new Set(['m']));
        expect(coded.initialized).toEqual(new Set(['i']));
        expect(coded.initializedUnion).toEqual(new Set(['u']));
        expect(coded.list).toEqual(['l']);
    };

    it('should be known to the model where TypeScript records it as a Set, or the class initializes it with one', () => {
        expect([...registry.fragment(Coded).sets].sort()).toEqual(['codes', 'initialized', 'initializedUnion', 'packed']);
        expect([...registry.relationshipFragment(Coding).sets]).toEqual([]);
    });

    it('should load the list the store holds as a Set', () => {
        expectSets(mapper.fragment<Coded>(registry.fragment(Coded), row('c1')));
    });

    it("should leave a field Drivine can't tell from a list as the list: one declared with a union, or undecorated", () => {
        const coded = mapper.fragment<Coded>(registry.fragment(Coded), row('c1'));
        expect(Reflect.getMetadata('design:type', Coded.prototype, 'union')).toBe(Object);
        expect(Reflect.getMetadata('design:type', Coded.prototype, 'undecorated')).toBeUndefined();
        expect(coded.union).toEqual(['n']);
        expect(coded.undecorated).toEqual(['d']);
    });

    it('should leave a field the node holds nothing for absent, or with its initializer, and a null as null', () => {
        const absent = load({});
        expect(absent.codes).toBeUndefined();
        expect(absent.marked).toBeUndefined();
        expect(absent.packed).toBeUndefined();
        expect(absent.initialized).toEqual(new Set());
        const nulls = load({ code_set: null, marked: null, packed: null });
        expect(nulls.codes).toBeNull();
        expect(nulls.marked).toBeNull();
        expect(nulls.packed).toBeNull();
    });

    it('should load the {} a set saved before sets were stored as lists was held as as an empty Set', () => {
        expect(load({ code_set: {}, packed: '{}' }).codes).toEqual(new Set());
        expect(load({ code_set: {}, packed: '{}' }).packed).toEqual(new Set());
    });

    it("should load a Set in a view's root, in a view it holds, in a relationship fragment and at a path's end", () => {
        const holder = mapper.view<CodedHolder>(registry.view(CodedHolder), {
            root: row('root'),
            rels: {
                view: { root: row('nested'), rels: { related: [row('related')] } },
                codings: [{ rel: { reasons: ['r'] }, target: row('target') }],
                far: [row('far')]
            }
        });
        expectSets(holder.root);
        expectSets(holder.view!.root);
        expectSets(holder.view!.related[0]);
        expect(holder.codings[0].reasons).toEqual(new Set(['r']));
        expectSets(holder.codings[0].target);
        expectSets(holder.far[0]);
    });

    it('should save a loaded Set back as the list it was loaded from', () => {
        const loaded = mapper.fragment<Coded>(registry.fragment(Coded), row('c1'));
        const saved = new SaveStatementBuilder(NEO4J_GRAMMAR).build(
            { kind: 'NODE_FRAGMENT', model: registry.fragment(Coded) },
            loaded,
            {}
        ).bindings.root.props;
        expect(saved.code_set).toEqual(['a', 'b']);
        expect(saved.packed).toEqual('[1,2]');
        expect(saved.marked).toEqual(['m']);
        expect(saved.initialized).toEqual(['i']);
        expect(saved.initializedUnion).toEqual(['u']);
    });
});
