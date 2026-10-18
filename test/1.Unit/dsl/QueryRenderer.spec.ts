import {
    anyOf,
    below,
    caseOf,
    div,
    epochSeconds,
    hasNoValue,
    minus,
    FALKORDB_GRAMMAR,
    GraphRelationship,
    GraphView,
    ModelRegistry,
    NEO4J_GRAMMAR,
    NodeFragment,
    NodeId,
    QueryRenderer,
    RelationshipFragment,
    Root,
    TargetNode
} from '@liberation-data/drivine';

@NodeFragment({ labels: ['Task'] })
class Task {
    @NodeId() id: string;
    title: string;
    done: boolean;
    due?: Date;
    tags: string[];
    estimate(): number {
        return 1;
    }
}

@NodeFragment({ labels: ['Worker'] })
class Worker {
    @NodeId() id: string;
    name: string;
}

@RelationshipFragment()
class Assigned {
    role: string;
    @TargetNode() worker: Worker;
}

@GraphView()
class TaskView {
    @Root() task: Task;

    @GraphRelationship({ type: 'ASSIGNED', target: () => Assigned })
    assigned: Assigned[];

    @GraphRelationship({ type: 'BLOCKS', target: () => Task })
    blocks: Task[];
}

const registry = new ModelRegistry();
const view = { kind: 'GRAPH_VIEW' as const, model: registry.view(TaskView) };
const fragment = { kind: 'NODE_FRAGMENT' as const, model: registry.fragment(Task) };

describe('QueryRenderer', () => {
    it('should bind values as parameters, never write them into the text', () => {
        const query = QueryRenderer.render<Task>(
            (q) => ({ where: [q.title.eq("x' OR true"), q.done.eq(false)], orderBy: q.title.asc(), limit: 5 }),
            fragment,
            NEO4J_GRAMMAR,
            'n'
        );
        expect(query.where).toBe('(n.title = $_q0 AND n.done = $_q1)');
        expect(query.bindings).toEqual({ _q0: "x' OR true", _q1: false });
        expect(query.orderBy).toBe('n.title');
        expect(query.limit).toBe(5);
    });

    it('should write a test of related nodes as an existence check, one per engine', () => {
        const fn = (q: any) => ({ where: q.blocks.title.eq('a') });
        expect(QueryRenderer.render<TaskView>(fn, view, NEO4J_GRAMMAR, 'n').where).toBe(
            'EXISTS { MATCH (n)-[:BLOCKS]->(_x0:Task) WHERE _x0.title = $_q0 }'
        );
        expect(QueryRenderer.render<TaskView>(fn, view, FALKORDB_GRAMMAR, 'n').where).toBe(
            'any(_x0 IN [(n)-[:BLOCKS]->(_x0:Task) | _x0] WHERE _x0.title = $_q0)'
        );
    });

    it("should read a relationship fragment's properties from its relationship", () => {
        const fn = (q: any) => ({ where: q.assigned.any((a: any) => [a.role.eq('owner'), a.worker.name.eq('Ann')]) });
        expect(QueryRenderer.render<TaskView>(fn, view, NEO4J_GRAMMAR, 'n').where).toBe(
            'EXISTS { MATCH (n)-[_r1:ASSIGNED]->(_x0:Worker) WHERE (_r1.role = $_q0 AND _x0.name = $_q1) }'
        );
        expect(QueryRenderer.render<TaskView>(fn, view, FALKORDB_GRAMMAR, 'n').where).toBe(
            'any(_x0_e IN [(n)-[_r1:ASSIGNED]->(_x0:Worker) | {node: _x0, rel: properties(_r1)}] ' +
                'WHERE any(_x0 IN [_x0_e.node] WHERE (_x0_e.rel.role = $_q0 AND _x0.name = $_q1)))'
        );
    });

    it('should bind every value of an order expression, and divide reals', () => {
        const asOf = new Date('2040-01-01T00:00:00Z');
        const query = QueryRenderer.render<Task>(
            (q) => ({
                orderBy: caseOf(
                    [below(q.due, asOf).or(hasNoValue(q.due)).then(0)],
                    div(minus(epochSeconds(asOf), 7), 86400)
                ).desc()
            }),
            fragment,
            NEO4J_GRAMMAR,
            'n'
        );
        expect(query.orderBy).toBe(
            'CASE WHEN (n.due < $_q0 OR n.due IS NULL) THEN $_q1 ELSE (toFloat(($_q2 - $_q3)) / $_q4) END DESC'
        );
        expect(query.bindings).toEqual({ _q0: asOf, _q1: 0, _q2: 2208988800, _q3: 7, _q4: 86400 });
        expect(query.ordered).toEqual([]);
    });

    it('should place nulls with a key of their own', () => {
        const query = QueryRenderer.render<TaskView>(
            (q) => ({ orderBy: [q.task.due.desc().nullsLast(), q.task.title.asc().nullsFirst()] }),
            view,
            NEO4J_GRAMMAR,
            'n'
        );
        expect(query.orderBy).toBe('n.due IS NULL, n.due DESC, n.title IS NULL DESC, n.title');
    });

    it('should offer each field only what its type can do', () => {
        QueryRenderer.render<TaskView>(
            (q) => ({
                where: anyOf(
                    q.task.due.lt(new Date()),
                    q.task.tags.hasItem('x'),
                    q.assigned.worker.name.startsWith('A'),
                    q.blocks.none((b) => b.done.eq(true))
                )
            }),
            view,
            NEO4J_GRAMMAR,
            'n'
        );
        // Each line below fails to compile; the test passes when the compiler agrees.
        const typeErrors = (q: any) => [
            // @ts-expect-error a boolean has no order
            (q as import('@liberation-data/drivine').RootRefs<Task>).done.gt(true),
            // @ts-expect-error a string list holds items: it is not compared as a string
            (q as import('@liberation-data/drivine').RootRefs<Task>).tags.contains('x'),
            // @ts-expect-error methods are not fields
            (q as import('@liberation-data/drivine').RootRefs<Task>).estimate,
            // @ts-expect-error a title is compared to a string
            (q as import('@liberation-data/drivine').RootRefs<Task>).title.eq(3)
        ];
        expect(typeErrors).toBeDefined();
    });
});
