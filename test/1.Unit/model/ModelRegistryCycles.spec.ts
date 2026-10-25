import {
    GraphRelationship,
    GraphView,
    ModelRegistry,
    NodeFragment,
    NodeId,
    RelationshipFragment,
    Root,
    TargetNode
} from '@liberation-data/drivine';

// Fields that hold a class declared later in the file are typed `object`, naming their class in the decorator: the
// decorator metadata of `right?: Right` would read Right before it is defined.

/**
 * A view that fails takes with it every model built on its account: those may refer to it, as two views that refer to
 * each other do, and a model that refers to a refused view can't be loaded.
 */

@NodeFragment({ labels: ['Room'] })
class Room {
    @NodeId() id: string;
}

@NodeFragment({ labels: ['Broken'] })
class Broken {
    @NodeId() a: string;
    @NodeId() b: string;
}

@GraphView()
class Left {
    @Root() room: Room;
    @GraphRelationship({ type: 'NEXT', target: () => Right }) right?: object;
}

@GraphView()
class Right {
    @Root() room: Room;
    @GraphRelationship({ type: 'NEXT', target: () => Left }) left?: object;
    @GraphRelationship({ type: 'BROKEN', target: () => Broken }) broken?: object;
}

@RelationshipFragment()
class Visit {
    @TargetNode(() => Right) to: object;
}

@GraphView()
class Tour {
    @Root() room: Room;
    @GraphRelationship({ type: 'VISITS', target: () => Visit }) visits: object[];
}

@GraphView()
class Up {
    @Root() room: Room;
    @GraphRelationship({ type: 'NEXT', target: () => Down }) down?: object;
}

@GraphView()
class Down {
    @Root() room: Room;
    @GraphRelationship({ type: 'NEXT', target: () => Up }) up?: object;
}

const REFUSED = 'Broken has 2 @NodeId properties (a, b). A node has one id.';

describe('ModelRegistry, with views that refer to each other', () => {
    it.each([
        ['Left', Left],
        ['Right', Right]
    ])('refuses each, whichever is asked for first: %s', (_, first) => {
        const registry = new ModelRegistry();
        expect(() => registry.view(first)).toThrow(REFUSED);
        // The other was built, and cached, on the first's account: it is refused too, rather than loaded and failing later.
        for (const view of [Left, Right]) {
            expect(() => registry.view(view)).toThrow(REFUSED);
        }
    });

    it('refuses a relationship fragment that leads to a refused view', () => {
        const registry = new ModelRegistry();
        expect(() => registry.view(Tour)).toThrow(REFUSED);
        expect(() => registry.relationshipFragment(Visit)).toThrow(REFUSED);
    });

    it('builds each of two views that refer to each other and load once', () => {
        const registry = new ModelRegistry();
        const down = registry.view(Down);
        const up = registry.view(Up);
        expect(registry.view(Down)).toBe(down);
        expect(down.relationships[0].related.model).toBe(up);
        expect(up.relationships[0].related.model).toBe(down);
    });
});
