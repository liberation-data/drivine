import {
    CascadeTargets,
    CascadeType,
    CypherBackend,
    Direction,
    GraphRelationship,
    GraphView,
    MEMGRAPH_GRAMMAR,
    ModelRegistry,
    NEO4J_GRAMMAR,
    NodeFragment,
    NodeId,
    Root
} from '@liberation-data/drivine';

@NodeFragment({ labels: ['Doc'] })
class Doc {
    @NodeId() id: string;
}

@NodeFragment({ labels: ['Tag'] })
class Tag {}

@GraphView()
class Section {
    @Root() doc: Doc;
    @GraphRelationship({ type: 'TAGGED', required: true }) tag: Tag;
}

@GraphView()
class Book {
    @Root() doc: Doc;
    @GraphRelationship({ type: 'HAS', target: () => Section }) sections: Section[];
    @GraphRelationship({ type: 'CITES', direction: Direction.INCOMING, target: () => Tag }) citedBy: Tag[];
}

describe('CascadeTargets', () => {
    const registry = new ModelRegistry();

    it('should list each position in the view as a flat path from the root, with nested requirements', () => {
        expect(new CascadeTargets(NEO4J_GRAMMAR).of(registry.view(Book), 'n')).toEqual(
            '[(n)-[:HAS]->(c1:Doc) WHERE EXISTS { MATCH (c1)-[:TAGGED]->(:Tag) } | c1] + ' +
                '[(n)-[:HAS]->(c1:Doc)-[:TAGGED]->(c2:Tag) WHERE EXISTS { MATCH (c1)-[:TAGGED]->(:Tag) } | c2] + ' +
                '[(n)<-[:CITES]-(c3:Tag) | c3]'
        );
    });

    it('should refuse DELETE_ORPHAN where the engine cannot', () => {
        expect(() =>
            new CypherBackend(MEMGRAPH_GRAMMAR).delete(
                { kind: 'GRAPH_VIEW', model: registry.view(Book) },
                undefined,
                CascadeType.DELETE_ORPHAN
            )
        ).toThrow(/not available on Memgraph/);
    });
});
