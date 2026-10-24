import {
    EmptyWhenAbsent,
    GraphObjectMapper,
    JsonPacked,
    ModelRegistry,
    NEO4J_GRAMMAR,
    NodeFragment,
    NodeId,
    NodeStamp,
    NullPolicy,
    SaveStatementBuilder
} from '@liberation-data/drivine';

/**
 * Each shape of collection field, as TypeScript records it: `design:type` is Array for `string[]` and `more?: string[]`,
 * Set for `Set<string>`, Map for a Map, and Object for a map, and for a list or set declared with a union under strict
 * null checks, such as `string[] | null`.
 */
@NodeFragment({ labels: ['Shapes'] })
class Shapes {
    @NodeId() id: string;
    @EmptyWhenAbsent() plain: string[];
    @EmptyWhenAbsent() optional?: string[];
    @EmptyWhenAbsent({ kind: 'array' }) nullable: string[] | null;
    @EmptyWhenAbsent({ kind: 'array' }) undefinable: string[] | undefined;
    @EmptyWhenAbsent() set: Set<string>;
    @EmptyWhenAbsent({ kind: 'set' }) nullableSet: Set<string> | null;
    @EmptyWhenAbsent() record: Record<string, string>;
    @EmptyWhenAbsent() map: Map<string, string>;
    @JsonPacked() @EmptyWhenAbsent() packedSet: Set<string>;
    @NodeStamp() stamp?: string;
}

/** A list declared with a union and no kind named: TypeScript records it as it records a map. */
@NodeFragment({ labels: ['Unnamed'] })
class Unnamed {
    @NodeId() id: string;
    @EmptyWhenAbsent() tags: string[] | null;
}

const STAMP = '0123456789abcdef:fedcba9876543210';

describe('@EmptyWhenAbsent', () => {
    const registry = new ModelRegistry();
    const mapper = new GraphObjectMapper();
    const load = (props: Record<string, any>): Shapes =>
        mapper.fragment<Shapes>(registry.fragment(Shapes), { props: { id: 's1', ...props }, labels: ['Shapes'] });

    describe('the kind a field loads as', () => {
        it('should read it from the declared type where TypeScript records Array, Set, Map or Object', () => {
            const kinds = registry.fragment(Shapes).emptyWhenAbsent;
            expect(kinds.get('plain')).toEqual('array');
            expect(kinds.get('optional')).toEqual('array');
            expect(kinds.get('set')).toEqual('set');
            expect(kinds.get('record')).toEqual('object');
            expect(kinds.get('map')).toEqual('object');
        });

        it('should take the kind named for a list or set declared with a union, which TypeScript records as Object', () => {
            expect(Reflect.getMetadata('design:type', Shapes.prototype, 'nullable')).toBe(Object);
            expect(Reflect.getMetadata('design:type', Shapes.prototype, 'undefinable')).toBe(Object);
            expect(Reflect.getMetadata('design:type', Shapes.prototype, 'nullableSet')).toBe(Object);
            const kinds = registry.fragment(Shapes).emptyWhenAbsent;
            expect(kinds.get('nullable')).toEqual('array');
            expect(kinds.get('undefinable')).toEqual('array');
            expect(kinds.get('nullableSet')).toEqual('set');
        });

        it('should take a field recorded as Object, with no kind named, for a map', () => {
            expect(new ModelRegistry().fragment(Unnamed).emptyWhenAbsent.get('tags')).toEqual('object');
        });

        it('should refuse a kind the declared type contradicts', () => {
            @NodeFragment({ labels: ['Contradicted'] })
            class Contradicted {
                @NodeId() id: string;
                @EmptyWhenAbsent({ kind: 'object' }) tags: string[];
            }
            expect(() => new ModelRegistry().fragment(Contradicted)).toThrow(
                "@EmptyWhenAbsent Contradicted.tags names the kind 'object', but the field is declared a Array, " +
                    "which loads as 'array'."
            );
        });

        it('should refuse a field that holds no collection', () => {
            @NodeFragment({ labels: ['Scalar'] })
            class Scalar {
                @NodeId() id: string;
                @EmptyWhenAbsent() name: string;
            }
            expect(() => new ModelRegistry().fragment(Scalar)).toThrow(
                '@EmptyWhenAbsent Scalar.name loads an empty collection, but the field holds a String.'
            );
        });
    });

    describe('a load', () => {
        it('should give each field of a node that holds nothing for it an empty collection of its kind', () => {
            const loaded = load({});
            expect(loaded.plain).toEqual([]);
            expect(loaded.optional).toEqual([]);
            expect(loaded.nullable).toEqual([]);
            expect(loaded.undefinable).toEqual([]);
            expect(loaded.set).toEqual(new Set());
            expect(loaded.nullableSet).toEqual(new Set());
            expect(loaded.packedSet).toEqual(new Set());
            expect(loaded.record).toEqual({});
            expect(loaded.map).toEqual({});
        });

        it('should give a field a stored null as an empty collection', () => {
            expect(load({ nullable: null, set: null }).nullable).toEqual([]);
            expect(load({ nullable: null, set: null }).set).toEqual(new Set());
        });

        it('should load the list a store holds for a set as a set, and leave a list as it is', () => {
            const loaded = load({ plain: ['a'], nullable: ['b'], set: ['c', 'd'], packedSet: '["e"]' });
            expect(loaded.plain).toEqual(['a']);
            expect(loaded.nullable).toEqual(['b']);
            expect(loaded.set).toEqual(new Set(['c', 'd']));
            expect(loaded.packedSet).toEqual(new Set(['e']));
        });
    });

    describe('a save', () => {
        const save = (object: Shapes, options: Record<string, any> = {}) =>
            new SaveStatementBuilder(NEO4J_GRAMMAR).build(
                { kind: 'NODE_FRAGMENT', model: registry.fragment(Shapes) },
                object,
                options
            );

        it('should write what a node that held nothing loads as: an empty list for each list and set, never {}', () => {
            const props = save(load({})).bindings.root.props;
            expect(props.plain).toEqual([]);
            expect(props.optional).toEqual([]);
            expect(props.nullable).toEqual([]);
            expect(props.undefinable).toEqual([]);
            expect(props.set).toEqual([]);
            expect(props.nullableSet).toEqual([]);
            expect(props.packedSet).toEqual('[]');
        });

        it('should write a set as a list, and pack one as a JSON list', () => {
            const props = save(load({ set: ['a', 'b'], packedSet: '["c"]' })).bindings.root.props;
            expect(props.set).toEqual(['a', 'b']);
            expect(props.packedSet).toEqual('["c"]');
        });

        it('should compare a field loaded empty as maybe absent, and a set as the list it is stored as', () => {
            const loaded = load({ set: ['a'], '__drivine.stamp': STAMP });
            const changed = Object.assign(new Shapes(), { ...loaded, plain: ['x'] });
            const statement = save(changed, { nullPolicy: NullPolicy.CLEAR, loaded });
            const check = statement.text.split('\n').find((it) => it.endsWith(' AS _ok'))!;
            const compared = (field: string): string => {
                const param = Object.keys(statement.bindings).find(
                    (key) => key.startsWith('_loaded') && check.includes(`n.${field} <> $${key}`)
                )!;
                expect(param).toBeDefined();
                return param;
            };

            expect(check).toContain(`AND NOT coalesce(n.nullable <> $${compared('nullable')}, false)`);
            expect(check).not.toContain('n.nullable IS NOT NULL');
            expect(statement.bindings[compared('nullable')]).toEqual([]);
            expect(statement.bindings[compared('nullableSet')]).toEqual([]);
            expect(check).not.toContain('n.nullableSet IS NOT NULL');
            expect(check).toContain('n.set IS NOT NULL');
            expect(statement.bindings[compared('set')]).toEqual(['a']);
            expect(statement.bindings[compared('packedSet')]).toEqual('[]');
        });
    });
});
