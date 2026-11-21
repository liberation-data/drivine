import { SqliteGraph } from '@liberation-data/drivine';
import { openSqlite, SqliteDatabase } from '@/connection/sqlite/SqliteDriver';
import { SqliteFunctions } from '@/connection/sqlite/SqliteFunctions';
import { WritePlan } from '@/backend/sql/WritePlan';
import { Direction } from '@/annotation/Metadata';
import { storedKey } from '@/backend/postgres/PostgresSaveBuilder';

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
        linking.link(linking.ref(shape, 'p1', 'p1'), linking.ref(shape, 'p2', 'p2'), 'KNOWS', Direction.OUTGOING, {
            since: 1.5
        });
        expect(write(linking, 'COUNT')).toEqual([1]);
        expect(write(linking, 'COUNT')).toEqual([1]);
        expect(edges()).toEqual([{ src: node('p1').nid, dst: node('p2').nid, type: 'KNOWS', props: '{"since":1.5}' }]);
        const after = node('p1').stamp;
        expect(after.slice(0, 16)).toEqual(before.slice(0, 16));
        expect(after.slice(17)).not.toEqual(before.slice(17));
        const cutting = new WritePlan();
        cutting.cut(cutting.ref(cutting.shape(['Person'], 'id'), 'p1', 'p1'), undefined, 'KNOWS', Direction.OUTGOING);
        expect(write(cutting, 'COUNT')).toEqual([1]);
        expect(edges()).toEqual([]);
        // A node a step needs that is not there counts nothing.
        const missing = new WritePlan();
        missing.cut(
            missing.ref(missing.shape(['Person'], 'id'), 'nobody', 'nobody'),
            undefined,
            'KNOWS',
            Direction.OUTGOING
        );
        expect(write(missing, 'COUNT')).toEqual([0]);
    });

    it('should unlink a field to what the object no longer holds, deleting a target nothing else refers to', () => {
        const plan = saving('p1', {});
        const tags = plan.shape(['Tag'], 'id');
        for (const id of ['t1', 't2']) {
            plan.link(
                0,
                plan.node(tags, 'id', id, storedKey(id, 'sqlite'), ['Tag'], {}),
                'TAGGED',
                Direction.OUTGOING,
                {}
            );
        }
        write(plan, 'STAMPS');
        const trim = saving('p1', {});
        trim.unlink(
            0,
            'TAGGED',
            Direction.OUTGOING,
            trim.shape(['Tag'], 'id'),
            [storedKey('t1', 'sqlite')],
            true,
            true,
            []
        );
        write(trim, 'STAMPS');
        expect(edges().map((it) => it.type)).toEqual(['TAGGED']);
        expect(node('t2')).toBeUndefined();
        expect(node('t1')).toBeDefined();
    });

    it('should patch a node that is there, with each outcome, and make none', () => {
        write(saving('p1', { score: 1 }), 'STAMPS');
        const patching = (set: Record<string, any>, patchedIf: string | null = null): string[] => {
            const plan = new WritePlan();
            plan.patch(plan.shape(['Person'], 'id'), 'p1', 'p1', '0', set, []);
            plan.patch(plan.shape(['Person'], 'id'), 'nobody', 'nobody', '1', set, []);
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

    /** The plan's steps bound as a save binds them, each value in SQLite's layout: a date as its tag. */
    const written = (plan: WritePlan, returns: string): (string | number)[] =>
        JSON.parse(
            String(
                db
                    .prepare('SELECT drivine_write(?, ?, ?, ?, ?, ?) AS given')
                    .get(graph.name, plan.text('sqlite'), JSON.stringify(plan.shapesBound), plan.mark, returns, null)!
                    .given
            )
        );
    const days = (): any[] =>
        db.prepare(`SELECT props ->> '$.name' AS name FROM drivine_node WHERE instr(labels, '"Day"') > 0`).all();
    const day = new Date('2024-01-02T00:00:00.000Z');

    /** A plan that saves the day `on` as the root, named `name`. */
    const savingDay = (on: Date, name: string): WritePlan => {
        const plan = new WritePlan();
        plan.node(plan.shape(['Day'], 'on'), 'on', on, storedKey(on, 'sqlite'), ['Day'], { set: { name } }, undefined, {
            whole: false,
            mode: 'EITHER'
        });
        return plan;
    };

    it("should find a node of a date id by the id's JSON, so a date saved twice is one node (drivine-python#519)", () => {
        written(savingDay(day, 'first'), 'STAMPS');
        written(savingDay(new Date(day.getTime()), 'second'), 'STAMPS');
        expect(days()).toEqual([{ name: 'second' }]);
        // Twice in one plan, as a saveAll writes it, is one node too.
        const both = new WritePlan();
        const shape = both.shape(['Day'], 'on');
        const later = new Date('2024-01-03T00:00:00.000Z');
        for (const name of ['third', 'fourth']) {
            both.node(shape, 'on', later, storedKey(later, 'sqlite'), ['Day'], { set: { name } });
        }
        written(both, 'EACH_STAMP');
        expect(days().map((it) => it.name)).toEqual(['second', 'fourth']);
    });

    it("should find the node a ref and a patch name by the id's JSON, and none for a null id", () => {
        written(savingDay(day, 'first'), 'STAMPS');
        const patching = new WritePlan();
        patching.patch(patching.shape(['Day'], 'on'), storedKey(day, 'sqlite'), day, '0', { name: 'patched' }, []);
        expect(written(patching, 'EACH_STAMP').map((it) => String(it).split('=')[0])).toEqual(['0/1']);
        expect(days()).toEqual([{ name: 'patched' }]);
        // Beside a node whose id is the text "null", which a patch by a null id once reached (#773).
        const text = new WritePlan();
        text.node(text.shape(['Day'], 'on'), 'on', 'null', 'null', ['Day'], { set: { name: 'text' } });
        written(text, 'EACH_STAMP');
        const nobody = new WritePlan();
        nobody.patch(nobody.shape(['Day'], 'on'), 'null', null, '0', { name: 'none' }, []);
        expect(written(nobody, 'EACH_STAMP')).toEqual([]);
        expect(days().map((it) => it.name)).toEqual(['patched', 'text']);
        const joined = new WritePlan();
        const shape = joined.shape(['Day'], 'on');
        joined.link(
            joined.ref(shape, storedKey(day, 'sqlite'), day),
            joined.ref(shape, storedKey(day, 'sqlite'), day),
            'NEXT',
            Direction.OUTGOING,
            {}
        );
        expect(written(joined, 'COUNT')).toEqual([1]);
    });

    it("should unlink a target of a date id by its tag's text, and keep the one still held", () => {
        const second = new Date('2025-01-02T00:00:00.000Z');
        const first = new Date('2025-01-01T00:00:00.000Z');
        const plan = saving('p1', {});
        const shape = plan.shape(['Day'], 'on');
        for (const on of [first, second]) {
            plan.link(
                0,
                plan.node(shape, 'on', on, storedKey(on, 'sqlite'), ['Day'], { set: { name: on.toISOString() } }),
                'ON_DAY',
                Direction.OUTGOING,
                {}
            );
        }
        written(plan, 'STAMPS');
        const held = db
            .prepare(`SELECT stamp FROM drivine_node WHERE props ->> '$.name' = ?`)
            .get(second.toISOString());
        const trim = saving('p1', {});
        trim.unlink(
            0,
            'ON_DAY',
            Direction.OUTGOING,
            trim.shape(['Day'], 'on'),
            [storedKey(second, 'sqlite')],
            true,
            false,
            [storedKey(second, 'sqlite')]
        );
        written(trim, 'STAMPS');
        expect(edges().map((it) => it.type)).toEqual(['ON_DAY']);
        expect(
            db.prepare(`SELECT stamp FROM drivine_node WHERE props ->> '$.name' = ?`).get(second.toISOString())
        ).toEqual(held);
        expect(
            days()
                .map((it) => it.name)
                .sort()
        ).toEqual([first.toISOString(), second.toISOString()]);
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
