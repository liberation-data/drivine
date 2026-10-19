import {
    ClassKind,
    Direction,
    GraphProperty,
    GraphRelationship,
    GraphTransient,
    GraphView,
    ModelRegistry,
    NodeFragment,
    NodeId,
    ReadOnly,
    Related,
    RelationshipFragment,
    Root,
    TargetNode
} from '@liberation-data/drivine';

@NodeFragment({ labels: ['Person'] })
class Person {
    @NodeId() uuid: string;
    name: string;
    @GraphProperty('biography') bio?: string;
    @GraphTransient() displayName?: string;
}

@NodeFragment({ labels: ['Employee'] })
class Employee extends Person {
    employeeNumber: string;
}

@NodeFragment({ labels: ['Organization'] })
class Organization {
    @NodeId() @GraphProperty('org_id') id: string;
    name: string;
}

@RelationshipFragment()
class WorkHistory {
    role: string;
    @GraphProperty('start_date') startDate: string;
    @TargetNode() organization: Organization;
}

@GraphView()
class PersonCareer {
    @Root() person: Person;

    @GraphRelationship({ type: 'WORKS_FOR', target: () => WorkHistory })
    employmentHistory: WorkHistory[];

    @GraphRelationship({ type: 'LIVES_IN', direction: Direction.OUTGOING, required: true })
    city: Organization;
}

@GraphView()
class Category {
    @Root() node: Organization;

    @GraphRelationship({ type: 'PARENT', target: () => Category, maxDepth: 3 })
    parent?: Category;

    @GraphRelationship({ type: 'PARENT', direction: Direction.INCOMING, target: () => Category, maxDepth: 3 })
    children: Category[];
}

describe('ModelRegistry', () => {
    let registry: ModelRegistry;

    beforeEach(() => {
        registry = new ModelRegistry();
    });

    describe('fragments', () => {
        it('should read labels, id, renamed and transient fields', () => {
            const model = registry.fragment(Person);
            expect(model.labels).toEqual(['Person']);
            expect(model.nodeIdField).toEqual('uuid');
            expect(model.nodeIdProperty).toEqual('uuid');
            expect(model.graphProperties).toEqual(new Map([['bio', 'biography']]));
            expect(model.transientFields).toEqual(new Set(['displayName']));
        });

        it('should store the id under its @GraphProperty name', () => {
            const model = registry.fragment(Organization);
            expect(model.nodeIdField).toEqual('id');
            expect(model.nodeIdProperty).toEqual('org_id');
        });

        it('should inherit labels, own first, and decorated properties', () => {
            const model = registry.fragment(Employee);
            expect(model.labels).toEqual(['Employee', 'Person']);
            expect(model.nodeIdField).toEqual('uuid');
            expect(model.graphProperties.get('bio')).toEqual('biography');
        });

        it('should build each model once', () => {
            expect(registry.fragment(Person)).toBe(registry.fragment(Person));
        });

        it('should tell a class kind', () => {
            expect(registry.kindOf(Employee)).toEqual(ClassKind.NODE_FRAGMENT);
            expect(registry.kindOf(WorkHistory)).toEqual(ClassKind.RELATIONSHIP_FRAGMENT);
            expect(registry.kindOf(PersonCareer)).toEqual(ClassKind.GRAPH_VIEW);
            expect(registry.kindOf(class Plain {})).toBeUndefined();
        });
    });

    describe('relationship fragments', () => {
        it('should find the target node and the relationship properties', () => {
            const model = registry.relationshipFragment(WorkHistory);
            expect(model.targetField).toEqual('organization');
            expect(model.target.kind).toEqual('NODE_FRAGMENT');
            expect(model.target.model.type).toBe(Organization);
            expect(model.graphProperties).toEqual(new Map([['startDate', 'start_date']]));
        });
    });

    describe('views', () => {
        it('should find the root and the relationships', () => {
            const model = registry.view(PersonCareer);
            expect(model.rootField).toEqual('person');
            expect(model.root.type).toBe(Person);

            const [history, city] = model.relationships;
            expect(history).toEqual(
                expect.objectContaining({
                    field: 'employmentHistory',
                    type: 'WORKS_FOR',
                    direction: Direction.OUTGOING,
                    maxDepth: 1,
                    required: false,
                    isCollection: true
                })
            );
            expect(history.related.kind).toEqual('RELATIONSHIP_FRAGMENT');
            expect(city.isCollection).toBe(false);
            expect(city.required).toBe(true);
            expect(city.related.kind).toEqual('NODE_FRAGMENT');
            expect(city.related.model.type).toBe(Organization);
        });

        it('should resolve a view that refers to itself', () => {
            const model = registry.view(Category);
            const [parent, children] = model.relationships;
            expect(parent.related.model).toBe(model);
            expect(children.related.model).toBe(model);
            expect(children.direction).toEqual(Direction.INCOMING);
            expect(children.maxDepth).toEqual(3);
        });

        it('should resolve views that refer to each other', () => {
            @GraphView()
            class A {
                @Root() root: Person;
                @GraphRelationship({ type: 'TO_B', target: () => B }) b?: Related<B>;
            }
            @GraphView()
            class B {
                @Root() root: Organization;
                @GraphRelationship({ type: 'TO_A', target: () => A, direction: Direction.INCOMING }) a: A[];
            }
            const a = registry.view(A);
            expect(a.relationships[0].related.model).toBe(registry.view(B));
            expect(registry.view(B).relationships[0].related.model).toBe(a);
        });
    });

    describe('refuses', () => {
        it('a fragment without labels', () => {
            @NodeFragment()
            class Unlabelled {}
            expect(() => registry.fragment(Unlabelled)).toThrow(/has no labels/);
        });

        it('a fragment with two ids', () => {
            @NodeFragment({ labels: ['X'] })
            class TwoIds {
                @NodeId() a: string;
                @NodeId() b: string;
            }
            expect(() => registry.fragment(TwoIds)).toThrow(/2 @NodeId properties \(a, b\)/);
        });

        it('a class that is not the kind asked for', () => {
            expect(() => registry.view(Person)).toThrow(/Person is not a @GraphView/);
            expect(() => registry.fragment(PersonCareer)).toThrow(/PersonCareer is not a @NodeFragment/);
        });

        it('a class decorated as two kinds', () => {
            expect(() => {
                @GraphView()
                @NodeFragment({ labels: ['X'] })
                class Both {}
                return Both;
            }).toThrow(/can't be both/);
        });

        it('a view without exactly one root', () => {
            @GraphView()
            class NoRoot {}
            expect(() => registry.view(NoRoot)).toThrow(/exactly one @Root property. It has 0/);
        });

        it('a root that is not a node fragment', () => {
            @GraphView()
            class BadRoot {
                @Root(() => PersonCareer) root: PersonCareer;
            }
            expect(() => registry.view(BadRoot)).toThrow(/must be a @NodeFragment/);
        });

        it('a list relationship without a target', () => {
            @GraphView()
            class NoTarget {
                @Root() root: Person;
                @GraphRelationship({ type: 'KNOWS' }) friends: Person[];
            }
            expect(() => registry.view(NoTarget)).toThrow(/does not keep the type of a list's items/);
        });

        it('a relationship to a class that is not mapped', () => {
            class Plain {}
            @GraphView()
            class ToPlain {
                @Root() root: Person;
                @GraphRelationship({ type: 'HAS' }) plain: Plain;
            }
            expect(() => registry.view(ToPlain)).toThrow(/ToPlain.plain holds Plain, which is not/);
        });

        it('and does not keep, a view whose relationship is wrong', () => {
            class Plain {}
            @GraphView()
            class ToPlain {
                @Root() root: Person;
                @GraphRelationship({ type: 'HAS' }) plain: Plain;
            }
            expect(() => registry.view(ToPlain)).toThrow();
            expect(() => registry.view(ToPlain)).toThrow();
        });

        it('a bad maxDepth', () => {
            @GraphView()
            class Deep {
                @Root() root: Person;
                @GraphRelationship({ type: 'KNOWS', target: () => Person, maxDepth: 0 }) friends: Person[];
            }
            expect(() => registry.view(Deep)).toThrow(/maxDepth on Deep.friends/);
        });

        it('a decorator in the wrong place', () => {
            @NodeFragment({ labels: ['X'] })
            class Misplaced {
                @Root() root: Person;
            }
            expect(() => registry.fragment(Misplaced)).toThrow(
                /Misplaced.root: @Root can't be used on a @NodeFragment/
            );
        });

        it('a relationship fragment without exactly one target node', () => {
            @RelationshipFragment()
            class NoTargetNode {
                role: string;
            }
            expect(() => registry.relationshipFragment(NoTargetNode)).toThrow(/exactly one @TargetNode/);
        });
    });
});

describe('ModelRegistry read-only fields', () => {
    it('should refuse @ReadOnly without a relationship, and maxDepth on relationship fragments', () => {
        @NodeFragment({ labels: ['P'] })
        class P {
            @NodeId() id: string;
        }
        @GraphView()
        class BadReadOnly {
            @Root() p: P;
            @ReadOnly() name: string;
        }
        expect(() => new ModelRegistry().view(BadReadOnly)).toThrow(/marks a relationship field; it has none/);

        @RelationshipFragment()
        class Edge {
            @TargetNode() p: P;
        }
        @GraphView()
        class DeepEdges {
            @Root() p: P;
            @GraphRelationship({ type: 'R', target: () => Edge, maxDepth: 2 }) edges: Edge[];
        }
        expect(() => new ModelRegistry().view(DeepEdges)).toThrow(/can't be above 1/);
    });
});
