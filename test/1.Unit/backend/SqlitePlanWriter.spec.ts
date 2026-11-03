import { SqliteGraph } from '@liberation-data/drivine';
import { openSqlite, SqliteDatabase } from '@/connection/sqlite/SqliteDriver';
import { SqliteFunctions } from '@/connection/sqlite/SqliteFunctions';
import { WritePlan } from '@/backend/sql/WritePlan';
import { Direction } from '@/annotation/Metadata';

/**
 * `drivine_write` carries out a plan of steps as Postgres's write function does: drivine4j's `SqlitePlanWriter`, step for
 * step. Run here on a database in memory, with the functions a connection registers.
 */
describe('drivine_write', () => {
    let db: SqliteDatabase;
    const graph = new SqliteGraph();

    const write = (plan: WritePlan, returns: string, patchedIf: string | null = null): (string | number)[] =>
        JSON.parse(
            String(
                db
                    .prepare('SELECT drivine_write(?, ?, ?, ?, ?, ?) AS given')
                    .get(
                        graph.name,
                        JSON.stringify(plan.plan),
                        JSON.stringify(plan.shapesBound),
                        plan.mark,
                        returns,
                        patchedIf
                    )!.given
            )
        );
    const node = (id: string): any => db.prepare(`SELECT * FROM drivine_node WHERE props ->> 'id' = ?`).get(id);
    const edges = (): any[] => db.prepare('SELECT src, dst, type, props FROM drivine_edge ORDER BY eid').all();

    beforeEach(() => {
        db = openSqlite(':memory:');
        SqliteFunctions.register(db);
        graph.ddl.forEach((it) => db.exec(it));
    });

    afterEach(() => db.close());

    /** A plan that saves the person `id` as the root, with `set`, expecting `expect` where given. */
    const saving = (
        id: string,
        set: Record<string, any>,
        root: Partial<{ carried: string; expect: string }> = {}
    ): WritePlan => {
        const plan = new WritePlan();
        plan.node(plan.shape(['Person'], 'id'), 'id', id, id, ['Person', 'Agent'], { set }, undefined, {
            carried: root.carried,
            expect: root.expect,
            whole: false,
            mode: 'EITHER'
        });
        return plan;
    };

    it('should make a node with its labels sorted and a stamp, and hand back the whole stamp', () => {
        const [stamp] = write(saving('p1', { name: 'Ada' }), 'STAMPS');
        const row = node('p1');
        expect(row.labels).toEqual('["Agent","Person"]');
        expect(JSON.parse(row.props)).toEqual({ id: 'p1', name: 'Ada' });
        expect(stamp).toEqual(row.stamp);
        expect(row.stamp).toMatch(/^[0-9a-f]{16}:[0-9a-f]{16}$/);
    });

    it('should keep the stamp of a node a save leaves as it was, and give one it changes a new first token', () => {
        write(saving('p1', { name: 'Ada' }), 'STAMPS');
        const first = node('p1').stamp;
        write(saving('p1', { name: 'Ada' }), 'STAMPS');
        expect(node('p1').stamp).toEqual(first);
        write(saving('p1', { name: 'Ada L' }), 'STAMPS');
        const changed = node('p1').stamp;
        expect(changed.slice(0, 16)).not.toEqual(first.slice(0, 16));
        expect(changed.slice(17)).toEqual(first.slice(17));
    });

    it('should write nothing for a stale root, and nothing for one the save expected that is gone', () => {
        write(saving('p1', { name: 'Ada' }), 'STAMPS');
        expect(write(saving('p1', { name: 'Bob' }, { carried: 'x', expect: 'aaaaaaaaaaaaaaaa' }), 'STAMPS')).toEqual(
            []
        );
        expect(JSON.parse(node('p1').props).name).toEqual('Ada');
        expect(write(saving('gone', { name: 'Bob' }, { carried: 'x', expect: 'aaaaaaaaaaaaaaaa' }), 'STAMPS')).toEqual(
            []
        );
        expect(node('gone')).toBeUndefined();
    });

    it('should link once, count what it links, cut it, and give both ends a new second token', () => {
        write(saving('p1', {}), 'STAMPS');
        write(saving('p2', {}), 'STAMPS');
        const before = node('p1').stamp;
        const linking = new WritePlan();
        const shape = linking.shape(['Person'], 'id');
        linking.link(linking.ref(shape, 'p1'), linking.ref(shape, 'p2'), 'KNOWS', Direction.OUTGOING, { since: 1.5 });
        expect(write(linking, 'COUNT')).toEqual([1]);
        expect(write(linking, 'COUNT')).toEqual([1]);
        expect(edges()).toEqual([{ src: node('p1').nid, dst: node('p2').nid, type: 'KNOWS', props: '{"since":1.5}' }]);
        const after = node('p1').stamp;
        expect(after.slice(0, 16)).toEqual(before.slice(0, 16));
        expect(after.slice(17)).not.toEqual(before.slice(17));
        const cutting = new WritePlan();
        cutting.cut(cutting.ref(cutting.shape(['Person'], 'id'), 'p1'), undefined, 'KNOWS', Direction.OUTGOING);
        expect(write(cutting, 'COUNT')).toEqual([1]);
        expect(edges()).toEqual([]);
        // A node a step needs that is not there counts nothing.
        const missing = new WritePlan();
        missing.cut(missing.ref(missing.shape(['Person'], 'id'), 'nobody'), undefined, 'KNOWS', Direction.OUTGOING);
        expect(write(missing, 'COUNT')).toEqual([0]);
    });

    it('should unlink a field to what the object no longer holds, deleting a target nothing else refers to', () => {
        const plan = saving('p1', {});
        const tags = plan.shape(['Tag'], 'id');
        for (const id of ['t1', 't2']) {
            plan.link(0, plan.node(tags, 'id', id, id, ['Tag'], {}), 'TAGGED', Direction.OUTGOING, {});
        }
        write(plan, 'STAMPS');
        const trim = saving('p1', {});
        trim.unlink(0, 'TAGGED', Direction.OUTGOING, trim.shape(['Tag'], 'id'), ['t1'], true, true, []);
        write(trim, 'STAMPS');
        expect(edges().map((it) => it.type)).toEqual(['TAGGED']);
        expect(node('t2')).toBeUndefined();
        expect(node('t1')).toBeDefined();
    });

    it('should patch a node that is there, with each outcome, and make none', () => {
        write(saving('p1', { score: 1 }), 'STAMPS');
        const patching = (set: Record<string, any>, patchedIf: string | null = null): string[] => {
            const plan = new WritePlan();
            plan.patch(plan.shape(['Person'], 'id'), 'p1', '0', set, []);
            plan.patch(plan.shape(['Person'], 'id'), 'nobody', '1', set, []);
            return write(plan, 'EACH_STAMP', patchedIf).map((it) => String(it).split('=')[0]);
        };
        expect(patching({ score: 2 })).toEqual(['0/1']);
        expect(patching({ score: 2.0 })).toEqual(['0/0']);
        expect(patching({ score: 3 }, `SELECT COUNT(*) FROM drivine_node n WHERE n.nid = $1 AND 1 = 0`)).toEqual([
            '0/-'
        ]);
        expect(node('nobody')).toBeUndefined();
    });

    it('should write the lowercased copy of a property from what the node holds, and no new stamp for it alone', () => {
        const plan = new WritePlan();
        plan.node(plan.shape(['Person'], 'id'), 'id', 'p1', 'p1', ['Person'], {
            set: { email: 'ÀDA@X' },
            lower: ['email']
        });
        write(plan, 'EACH_STAMP');
        expect(JSON.parse(node('p1').props)['__drivine.lower.email']).toEqual('àda@x');
    });

    it('should roll back what a plan wrote when it fails part way', () => {
        db.exec(`CREATE UNIQUE INDEX one_name ON drivine_node ((props ->> '$.name'))`);
        write(saving('p1', { name: 'Ada' }), 'STAMPS');
        const plan = saving('p2', { name: 'Bob' });
        plan.node(plan.shape(['Person'], 'id'), 'id', 'p3', 'p3', ['Person'], { set: { name: 'Ada' } });
        expect(() => write(plan, 'STAMPS')).toThrow(/UNIQUE constraint failed/);
        expect(node('p2')).toBeUndefined();
    });
});
