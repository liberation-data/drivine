import { Direction } from '@/annotation/Metadata';
import { WritePlan } from '@/backend/sql/WritePlan';
import { cypherFloat } from '@/cypher/CypherFloat';
import { cypherCompilerModule, useCypherCompiler } from '@/cypher/SharedCypherCompiler';

/**
 * A plan's steps in the store layout (drivine-cypher-spec#161), as drivine4j's plan writes them: the values a step
 * writes and the id it finds a node by written as the module writes them for the store (drivine-cypher-spec#329), and
 * each property name it keys, removes, clears or lowercases, and its shapes' keys, with one more `$` before a name that
 * begins with one.
 */
describe('WritePlan', () => {
    it('holds the names and values of its steps and shapes as the store layout holds them', () => {
        const plan = new WritePlan();
        const shape = plan.shape(['Person'], '$id');
        expect(plan.shape(['Person'], '$id')).toBe(shape);
        const from = plan.node(shape, '$id', 'p1', 'p1', ['Person'], {
            set: { $k: { $n: 1 }, plain: 'a$' },
            unset: ['$gone', 'kept'],
            lower: ['$name']
        });
        const to = plan.ref(shape, 'p2', 'p2');
        plan.link(from, to, 'KNOWS', Direction.OUTGOING, { $w: 1 }, ['$old']);
        plan.patch(shape, 'p2', 'p2', '0', { at: new Date(0) }, ['$x']);
        expect(plan.shapesBound).toEqual([{ labels: ['Person'], key: '$$id' }]);
        const [node, ref, link, patch] = JSON.parse(plan.text('postgres'));
        expect(node).toMatchObject({
            key: '$$id',
            id: 'p1',
            set: { $$k: { $$n: 1 }, plain: 'a$' },
            unset: ['$$gone', 'kept'],
            lower: ['$$name']
        });
        expect(ref).toMatchObject({ op: 'ref', k: 'p2', id: 'p2' });
        expect(link).toMatchObject({ props: { $$w: 1 }, clear: ['$$old'] });
        expect(patch).toMatchObject({ set: { at: { $t: 'datetime', v: '1970-01-01T00:00:00Z' } }, unset: ['$$x'] });
    });

    it("writes each value a step writes and each id it finds a node by as the store's layout holds it", () => {
        const plan = new WritePlan();
        const shape = plan.shape(['Gauge'], 'id');
        const node = plan.node(shape, 'id', 4.5, '4.5', ['Gauge'], {
            set: { id: 4.5, f: cypherFloat(2), inf: Infinity, b: new Uint8Array([1, 255]) }
        });
        plan.link(node, plan.ref(shape, '2', 2), 'READS', Direction.OUTGOING, { w: cypherFloat(3) });
        expect(plan.text('oracle')).toContain('"id":{"$numberDouble":"4.5"},"labels":["Gauge"]');
        expect(plan.text('oracle')).toContain(
            '"set":{"id":{"$numberDouble":"4.5"},"f":{"$numberDouble":"2.0"},"inf":{"$numberDouble":"Infinity"},"b":[1,-1]}'
        );
        expect(plan.text('oracle')).toContain('"props":{"w":{"$numberDouble":"3.0"}}');
        expect(plan.text('sqlite')).toContain('"set":{"id":4.5,"f":2.0,"inf":9e999,"b":[1,-1]}');
        // Postgres's jsonb holds no infinity: the plan is refused, with the message a CREATE given one is refused with.
        expect(() => plan.text('postgres')).toThrow(
            "A statement that writes is given NaN or an infinity, which Postgres's `jsonb` holds as no number: it would store another value in its place."
        );
    });

    it('writes a plan of no float, date, bytes or key that begins with $ as its JSON text, asking the module nothing', () => {
        const module = cypherCompilerModule();
        const asked: string[] = [];
        useCypherCompiler({
            ...module,
            compile: (request: string) => {
                asked.push(request);
                return module.compile(request);
            }
        });
        try {
            const plan = new WritePlan();
            plan.node(plan.shape(['Person'], 'id'), 'id', 'p1', 'p1', ['Person'], {
                set: { n: 1, s: 'a$', l: [true] }
            });
            for (const store of ['postgres', 'oracle', 'sqlite'] as const) {
                expect(plan.text(store)).toContain('"set":{"n":1,"s":"a$","l":[true]}');
            }
            expect(asked).toEqual([]);
        } finally {
            useCypherCompiler(module);
        }
    });

    it('finds no node by a null id, sending it as null', () => {
        const plan = new WritePlan();
        plan.ref(plan.shape(['Person'], 'id'), 'nobody', undefined);
        expect(plan.plan[0]).toMatchObject({ op: 'ref', id: null });
    });
});
