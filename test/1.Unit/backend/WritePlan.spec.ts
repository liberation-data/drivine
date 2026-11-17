import { Direction } from '@/annotation/Metadata';
import { WritePlan } from '@/backend/sql/WritePlan';

/**
 * A plan's steps in the store layout (drivine-cypher-spec#161), as drivine4j's plan writes them: the values a step
 * writes and the id it finds a node by written as the module writes them, and each property name it keys, removes,
 * clears or lowercases, and its shapes' keys, with one more `$` before a name that begins with one.
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
        const [node, ref, link, patch] = plan.plan;
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

    it('finds no node by a null id, sending it as null', () => {
        const plan = new WritePlan();
        plan.ref(plan.shape(['Person'], 'id'), 'nobody', undefined);
        expect(plan.plan[0]).toMatchObject({ op: 'ref', id: null });
    });
});
