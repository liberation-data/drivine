import {
    CascadeTargets,
    CascadeType,
    CypherBackend,
    Direction,
    GraphBackend,
    GraphRelationship,
    GraphView,
    MEMGRAPH_GRAMMAR,
    ModelRegistry,
    NEO4J_GRAMMAR,
    NodeFragment,
    NodeId,
    OracleBackend,
    OracleGraph,
    PostgresBackend,
    PostgresGraph,
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

@NodeFragment({ labels: ['Note'] })
class Note {}

/** A view that contains itself: parts point at the doc they are part of. */
@GraphView()
class Tree {
    @Root() doc: Doc;
    @GraphRelationship({ type: 'HAS', target: () => Note }) notes: Note[];
    @GraphRelationship({ type: 'PART_OF', direction: Direction.INCOMING, target: () => Tree, maxDepth: 2 })
    parts: Tree[];
}

@GraphView()
class Shelf {
    @Root() doc: Doc;
    @GraphRelationship({ type: 'SHELVES', target: () => Tree }) trees: Tree[];
}

@GraphView()
class Pals {
    @Root() doc: Doc;
    @GraphRelationship({ type: 'KNOWS', direction: Direction.UNDIRECTED, target: () => Doc }) pals: Doc[];
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

    it('should read each level of a view that contains itself, holding what the root does', () => {
        const targets = new CascadeTargets(NEO4J_GRAMMAR).of(registry.view(Tree), 'n');
        expect(targets).toContain('[(n)<-[:PART_OF]-(c2:Doc)-[:HAS]->(c3:Note) | c3]');
        expect(targets).toContain('[(n)<-[:PART_OF]-(c2:Doc)<-[:PART_OF]-(c4:Doc)-[:HAS]->(c5:Note) | c5]');
        expect(targets).not.toContain('*');
    });

    const view = (type: any): any => ({ kind: 'GRAPH_VIEW', model: registry.view(type) });
    const backends: [string, GraphBackend][] = [
        ['Cypher', new CypherBackend(NEO4J_GRAMMAR)],
        ['Oracle', new OracleBackend(new OracleGraph())],
        ['Postgres', new PostgresBackend(new PostgresGraph())]
    ];

    it.each(backends)(
        'should check a recursive field one level below its depth, where it is reached, on %s',
        (_, backend) => {
            expect(backend.cascadeDepthChecks(view(Book))).toEqual([]);
            expect(backend.cascadeDepthChecks({ kind: 'NODE_FRAGMENT', model: registry.fragment(Doc) })).toEqual([]);
            const [check, ...others] = backend.cascadeDepthChecks(view(Shelf));
            expect(others).toEqual([]);
            expect({ view: check.view, field: check.field, maxDepth: check.maxDepth }).toEqual({
                view: 'Tree',
                field: 'parts',
                maxDepth: 2
            });
            expect(check.statement.text).toMatch(/beyond/);
        }
    );

    it('should read the nodes past the depth through the shelf, and count those the cascade does not reach', () => {
        const [check] = new CypherBackend(NEO4J_GRAMMAR).cascadeDepthChecks(view(Shelf));
        expect(check.statement.text).toContain(
            '[(n)-[:SHELVES]->(c1:Doc)<-[:PART_OF]-(c3:Doc)<-[:PART_OF]-(c5:Doc)<-[:PART_OF]-(c7:Doc) | c7] AS beyond'
        );
        expect(check.statement.text).toContain('WHERE NOT b IN targets AND b <> n');
    });

    it('should keep, below a kept node, the far end of each step the cascade follows, in its direction', () => {
        const cypher = new CypherBackend(NEO4J_GRAMMAR).delete(view(Tree), undefined, CascadeType.DELETE_ORPHAN).text;
        expect(cypher).toContain('any(h IN [(h)-[:HAS]->(t) | h] + [(h)<-[:PART_OF]-(t) | h] WHERE');
        const tree = new OracleBackend(new OracleGraph()).delete(view(Tree), undefined, CascadeType.DELETE_ORPHAN).text;
        expect(tree).toContain("ON (e.type = 'HAS' AND e.src = k.nid) OR (e.type = 'PART_OF' AND e.dst = k.nid)");
        expect(tree.match(/e\.type = 'PART_OF' AND/g)).toHaveLength(1);
        expect(tree).toContain(") CYCLE nid SET looped TO 'Y' DEFAULT 'N'");
        const pals = new PostgresBackend(new PostgresGraph()).delete(
            view(Pals),
            undefined,
            CascadeType.DELETE_ORPHAN
        ).text;
        expect(pals).toContain("ON (e.type = 'KNOWS' AND (e.src = k.nid OR e.dst = k.nid))");
        expect(pals).toMatch(/^WITH RECURSIVE cascade_roots/);
    });
});
