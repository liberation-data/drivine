import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    above,
    backendFor,
    caseOf,
    equalTo,
    Connection,
    DatabaseRegistry,
    DatabaseType,
    FullTextIndex,
    fullTextIndex,
    GraphRelationship,
    GraphView,
    ModelRegistry,
    NodeFragment,
    NodeId,
    NodeStamp,
    PersistenceManager,
    PersistenceManagerFactory,
    QuerySpecification,
    rangeIndex,
    Root,
    SqliteBackend,
    SqliteGraph,
    StatelessGraphObjectManager,
    TransactionContextHolder,
    uniquenessConstraint,
    VectorIndex,
    vectorIndex
} from '@liberation-data/drivine';
import { DrivineLogger } from '@/logger';
import { LONG_LOCK_MILLIS } from '@/connection/sqlite/SqliteConnection';

jest.setTimeout(30_000);

@NodeFragment({ labels: ['SqliteStore', 'Ticket'] })
class Ticket {
    @NodeId() id: string;
    title?: string;
    priority?: number;
    openedAt?: Date;
    @NodeStamp() stamp?: string;
}

@NodeFragment({ labels: ['SqliteStore', 'Café'] })
class Cafe {
    @NodeId() id: string;
    name?: string;
}

@NodeFragment({ labels: ['SqliteStore', 'Doc'] })
class Doc {
    @NodeId() id: string;
    @FullTextIndex() body?: string;
    @VectorIndex({ dimensions: 3 }) embedding?: number[];
}

@NodeFragment({ labels: ['SqliteStore', 'Moment'] })
class Moment {
    @NodeId() id: string;
    at?: Date;
    open?: boolean;
    flags?: boolean[];
    days?: Date[];
    count?: number;
}

@GraphView()
class Regular {
    @Root() ticket: Ticket;
    @GraphRelationship({ type: 'AT', target: () => Cafe }) cafes: Cafe[] = [];
}

const ticket = (id: string, fields: Partial<Ticket> = {}): Ticket => Object.assign(new Ticket(), { id, ...fields });
const cafe = (id: string, name: string): Cafe => Object.assign(new Cafe(), { id, name });

/** A store of its own: a file in a folder of its own, removed after. */
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'drivine-sqlite-'));
const file = (name: string): string => path.join(folder, name);

/** Registers a store on the file, named after it, and gives a persistence manager on it. */
function store(name: string, graph?: string, busyTimeoutMillis?: number): PersistenceManager {
    DatabaseRegistry.getInstance()
        .builder()
        .withProperties({
            databaseType: DatabaseType.SQLITE,
            host: '',
            databaseName: file(`${name}.db`),
            defaultGraphPath: graph,
            connectionTimeout: busyTimeoutMillis
        })
        .register(name);
    return new PersistenceManagerFactory(DatabaseRegistry.getInstance(), TransactionContextHolder.getInstance()).get(
        name,
        'NON_TRANSACTIONAL'
    );
}

async function connection(name: string): Promise<Connection> {
    return DatabaseRegistry.getInstance().connectionProvider(name)!.connect();
}

/** The rows of a statement of plain SQL. */
async function rows(pm: PersistenceManager, sql: string, bindings: Record<string, any> = {}): Promise<any[]> {
    return pm.query(new QuerySpecification(sql).bind(bindings));
}

describe('a SQLite store', () => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;

    beforeAll(() => {
        pm = store('main');
        gom = new StatelessGraphObjectManager(pm, backendFor(DatabaseType.SQLITE), new ModelRegistry());
    });

    beforeEach(async () => {
        await pm.execute(new QuerySpecification(`DELETE FROM drivine_node WHERE instr(labels, '"SqliteStore"') > 0`));
    });

    afterAll(async () => {
        await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
        DatabaseRegistry.tearDown();
        fs.rmSync(folder, { recursive: true, force: true });
    });

    describe('its file', () => {
        it("should make the graph's tables on the first connection, as drivine4j makes them", async () => {
            const tables = await rows(
                pm,
                `SELECT name, sql FROM sqlite_master WHERE name LIKE 'drivine%' ORDER BY name`
            );
            expect(tables.map((it) => it.name)).toEqual([
                'drivine_edge',
                'drivine_edge_dst',
                'drivine_edge_src',
                'drivine_node',
                'drivine_schema'
            ]);
            expect(tables.find((it) => it.name === 'drivine_node').sql).toEqual(
                new SqliteGraph().ddl[0].replace(' IF NOT EXISTS', '')
            );
        });

        it("should make the tables of another graph at an object manager's first statement", async () => {
            const other = new StatelessGraphObjectManager(
                pm,
                backendFor(DatabaseType.SQLITE, 'tickets'),
                new ModelRegistry()
            );
            expect(await rows(pm, `SELECT name FROM sqlite_master WHERE name = 'tickets_node'`)).toEqual([]);
            expect(await other.count(Ticket)).toBe(0);
            expect((await rows(pm, `SELECT name FROM sqlite_master WHERE name LIKE 'tickets_%'`)).length).toBe(5);
        });

        it('should make the tables once when many connections first ask for them together', async () => {
            const racing = store('racing', 'race');
            await Promise.all(
                Array.from({ length: 8 }, async () => racing.query(new QuerySpecification('SELECT 1 AS one')))
            );
            const made = new SqliteGraph('race');
            expect((await rows(racing, made.made))[0].made).toBe(5);
        });

        it('should open each connection writing ahead to a log and keeping foreign keys', async () => {
            expect(await rows(pm, 'PRAGMA journal_mode')).toEqual([{ journal_mode: 'wal' }]);
            expect(await rows(pm, 'PRAGMA foreign_keys')).toEqual([{ foreign_keys: 1 }]);
        });

        it('should refuse a store with no file, as each pooled connection would open a database of its own', () => {
            const builder = DatabaseRegistry.getInstance()
                .builder()
                .withProperties({ databaseType: DatabaseType.SQLITE, host: '', databaseName: ':memory:' });
            expect(() => builder.register('memory')).toThrow(/names no file/);
        });

        it('should refuse Cypher, whose compiler for SQLite comes later', async () => {
            await expect(
                pm.query(new QuerySpecification({ text: 'MATCH (n) RETURN n', language: 'CYPHER' }))
            ).rejects.toThrow(/CYPHER is not run on SQLite/);
        });
    });

    describe('its layout', () => {
        it('should write labels sorted and unescaped, and properties and the stamp as drivine4j does', async () => {
            await gom.save(
                Object.assign(new Regular(), { ticket: ticket('t1', { title: 'Crash' }), cafes: [cafe('c1', 'Café')] })
            );
            const [row] = await rows(
                pm,
                `SELECT labels, props, stamp FROM drivine_node WHERE instr(labels, '"Café"') > 0 AND props ->> 'id' = 'c1'`
            );
            expect(row.labels).toEqual('["Café","SqliteStore"]');
            expect(JSON.parse(row.props)).toEqual({ id: 'c1', name: 'Café' });
            expect(row.stamp).toMatch(/^[0-9a-f]{16}:[0-9a-f]{16}$/);
            const [edge] = await rows(pm, `SELECT type, props FROM drivine_edge WHERE type = 'AT'`);
            expect(edge).toEqual({ type: 'AT', props: '{}' });
        });

        it('should keep the text of a number no save writes, and compare numbers by value', async () => {
            await gom.save(ticket('t1', { title: 'Crash' }));
            await pm.execute(
                new QuerySpecification(
                    `UPDATE drivine_node SET props = json_set(props, '$.weight', json('1.50'), '$.big', json('12345678901234567890')) ` +
                        `WHERE props ->> 'id' = 't1'`
                )
            );
            const stamp = (await gom.load(Ticket, 't1'))!.stamp!;
            await gom.save(ticket('t1', { title: 'Crash', priority: 2 }));
            const [row] = await rows(pm, `SELECT props FROM drivine_node WHERE props ->> 'id' = 't1'`);
            expect(row.props).toContain('"weight":1.50');
            expect(row.props).toContain('"big":12345678901234567890');
            expect((await gom.load(Ticket, 't1'))!.stamp).not.toEqual(stamp);
        });

        it('should store a moment as ISO text', async () => {
            const openedAt = new Date('2026-11-02T10:30:00.123Z');
            await gom.save(ticket('t1', { openedAt }));
            const [row] = await rows(
                pm,
                `SELECT props ->> 'openedAt' AS at FROM drivine_node WHERE props ->> 'id' = 't1'`
            );
            expect(row.at).toEqual('2026-11-02T10:30:00.123Z');
        });

        it('should compare, seek and patch a boolean and a date as a save stores them: as JSON text', async () => {
            const first = new Date('2026-01-01T00:00:00.000Z');
            const second = new Date('2026-02-01T00:00:00.000Z');
            const moment = (id: string, fields: Partial<Moment>): Moment =>
                Object.assign(new Moment(), { id, ...fields });
            await gom.saveAll([
                moment('m1', { at: first, open: true, flags: [true], days: [first], count: 1 }),
                moment('m2', { at: second, open: false, flags: [false], days: [second], count: 2 })
            ]);
            const found = async (where: (q: any) => any): Promise<string[]> =>
                (await gom.loadAll(Moment, (q) => ({ where: where(q) }))).map((it) => it.id).sort();
            expect(await found((q) => q.at.eq(first))).toEqual(['m1']);
            expect(await found((q) => q.at.gt(first))).toEqual(['m2']);
            expect(await found((q) => q.at.in([second]))).toEqual(['m2']);
            expect(await found((q) => q.open.eq(true))).toEqual(['m1']);
            expect(await found((q) => q.open.in([false]))).toEqual(['m2']);
            expect(await found((q) => q.open.notIn([false]))).toEqual(['m1']);
            expect(await found((q) => q.flags.hasItem(true))).toEqual(['m1']);
            expect(await found((q) => q.days.hasItem(second))).toEqual(['m2']);
            const after = async (seek: (q: any) => any, order: (q: any) => any): Promise<string[]> =>
                (await gom.loadAll(Moment, (q) => ({ orderBy: order(q), seek: seek(q) }))).map((it) => it.id);
            expect(
                await after(
                    (q) => q.at.after(first),
                    (q) => q.at.asc()
                )
            ).toEqual(['m2']);
            expect(
                await after(
                    (q) => q.open.after(false),
                    (q) => q.open.asc()
                )
            ).toEqual(['m1']);
            const ordered = await gom.loadAll(Moment, (q) => ({
                orderBy: caseOf([equalTo(q.open as any, false).then(0), above(q.at, first).then(1)], 2).asc()
            }));
            expect(ordered.map((it) => it.id)).toEqual(['m2', 'm1']);
            // A patch's condition is written into the statement the write function runs, each value as a literal.
            const patched = async (where: any, bindings?: Record<string, any>): Promise<boolean> =>
                (await gom.patch(Moment, 'm1', { set: { count: 3 }, where, bindings })).applied;
            expect(await patched((q: any) => q.at.eq(first))).toBe(true);
            expect(await patched((q: any) => q.open.eq(true))).toBe(true);
            expect(await patched((q: any) => q.open.in([true]))).toBe(true);
            expect(await patched((q: any) => q.days.hasItem(first))).toBe(true);
            expect(await patched((q: any) => q.open.eq(false))).toBe(false);
            expect(await patched('n.at = $when', { when: first })).toBe(true);
            expect(await patched('n.open = $open', { open: true })).toBe(true);
        });

        it('should mint the store identity once, as a node of the graph', async () => {
            const identity = await gom.storeIdentity();
            const again = await new StatelessGraphObjectManager(
                pm,
                backendFor(DatabaseType.SQLITE),
                new ModelRegistry()
            ).storeIdentity();
            expect(again.id).toEqual(identity.id);
            expect(identity.engine).toEqual(DatabaseType.SQLITE);
            const [row] = await rows(pm, `SELECT labels FROM drivine_node WHERE instr(labels, '"DrivineStore"') > 0`);
            expect(row.labels).toEqual('["DrivineStore"]');
        });

        it('should read a statement Drivine marks as JSON as the values it holds, and one written by hand as it is', async () => {
            const [json] = await rows(pm, `/* drivine:json */ SELECT json_object('a', 1) AS doc, 7 AS n`);
            expect(json).toEqual({ doc: { a: 1 }, n: 7 });
            const [plain] = await rows(pm, `SELECT json_object('a', 1) AS doc`);
            expect(plain).toEqual({ doc: '{"a":1}' });
        });
    });

    describe('the functions it registers', () => {
        it('should read moments to the nanosecond, at their offsets', async () => {
            const [row] = await rows(
                pm,
                `SELECT drivine_epoch('1970-01-01T00:00:01.000000001Z') AS a, ` +
                    `drivine_epoch('2024-03-15T10:30:00+02:00') = drivine_epoch('2024-03-15T08:30:00') AS same, ` +
                    `drivine_epoch('2024-03-15T08:30:00.000000001') > drivine_epoch('2024-03-15T08:30:00Z') AS later, ` +
                    `drivine_epoch('not a moment') AS d`
            );
            expect(row).toEqual({ a: 1_000_000_001, same: 1, later: 1, d: null });
        });

        it('should lower text as Unicode does, match regular expressions, and count them', async () => {
            const [row] = await rows(
                pm,
                `SELECT drivine_lower('ÀÉÎ') AS lowered, 'graph db' REGEXP '^gr' AS matched, ` +
                    `drivine_regexp_count('a graph, a Graph', '(^|[^[:alnum:]_])graph($|[^[:alnum:]_])') AS counted`
            );
            expect(row).toEqual({ lowered: 'àéî', matched: 1, counted: 1 });
        });

        it('should score an embedding against a vector as the graph engines do', async () => {
            const [row] = await rows(
                pm,
                `SELECT drivine_similarity('[1,0]', '[1,0]', 'COSINE') AS same, drivine_similarity('[1,0]', '[0,1]', 'EUCLIDEAN') AS apart, ` +
                    `drivine_similarity('[1,0]', '[1,0,0]', 'COSINE') AS sized`
            );
            expect(row).toEqual({ same: 1, apart: 1 / 3, sized: null });
        });
    });

    describe('its transactions', () => {
        it('should take the write lock as one begins, so another writer waits for it without holding up the process', async () => {
            const holder = await connection('main');
            await holder.startTransaction();
            await holder.query(
                new QuerySpecification(
                    `INSERT INTO drivine_node (labels, props) VALUES ('["SqliteStore"]', '{"id":"held"}')`
                )
            );
            let written = false;
            const waiting = pm
                .execute(
                    new QuerySpecification(
                        `INSERT INTO drivine_node (labels, props) VALUES ('["SqliteStore"]', '{"id":"after"}')`
                    )
                )
                .then(() => (written = true));
            // The process goes on while the writer waits: a timer fires.
            await new Promise((resolve) => setTimeout(resolve, 50));
            expect(written).toBe(false);
            // A read outside a transaction doesn't wait for the writer, and sees what was committed.
            expect(await rows(pm, `SELECT COUNT(*) AS n FROM drivine_node WHERE props ->> 'id' = 'held'`)).toEqual([
                { n: 0 }
            ]);
            await holder.commitTransaction();
            await holder.release();
            await waiting;
            expect(written).toBe(true);
        });

        it('should roll back what a transaction wrote, and roll back one still open when its connection is given back', async () => {
            const rolled = await connection('main');
            await rolled.startTransaction();
            await rolled.query(
                new QuerySpecification(
                    `INSERT INTO drivine_node (labels, props) VALUES ('["SqliteStore"]', '{"id":"r1"}')`
                )
            );
            await rolled.rollbackTransaction();
            await rolled.release();
            const open = await connection('main');
            await open.startTransaction();
            await open.query(
                new QuerySpecification(
                    `INSERT INTO drivine_node (labels, props) VALUES ('["SqliteStore"]', '{"id":"r2"}')`
                )
            );
            await open.release(new Error('the work failed'));
            expect(
                await rows(pm, `SELECT COUNT(*) AS n FROM drivine_node WHERE props ->> 'id' IN ('r1', 'r2')`)
            ).toEqual([{ n: 0 }]);
            // The lock went with it.
            await pm.execute(
                new QuerySpecification(
                    `INSERT INTO drivine_node (labels, props) VALUES ('["SqliteStore"]', '{"id":"r3"}')`
                )
            );
        });

        it('should warn of a transaction that held the write lock long, however it ends', async () => {
            const warn = jest.spyOn(DrivineLogger.prototype, 'warn');
            const now = jest.spyOn(Date, 'now');
            try {
                for (const end of ['commit', 'rollback', 'release'] as const) {
                    warn.mockClear();
                    now.mockReturnValue(1_000);
                    const held = await connection('main');
                    await held.startTransaction();
                    now.mockReturnValue(1_000 + LONG_LOCK_MILLIS + 1);
                    if (end === 'commit') {
                        await held.commitTransaction();
                    } else if (end === 'rollback') {
                        await held.rollbackTransaction();
                    }
                    await held.release();
                    const warned = warn.mock.calls
                        .map(([message]) => String(message))
                        .filter((it) => it.includes('write lock'));
                    expect(warned).toEqual([
                        expect.stringContaining(
                            end === 'release' ? 'released' : end === 'commit' ? 'committed' : 'rolled back'
                        )
                    ]);
                }
                warn.mockClear();
                now.mockReturnValue(1_000);
                const short = await connection('main');
                await short.startTransaction();
                await short.commitTransaction();
                await short.release();
                expect(warn.mock.calls.filter(([message]) => String(message).includes('write lock'))).toEqual([]);
            } finally {
                now.mockRestore();
                warn.mockRestore();
            }
        });

        it('should turn away a writer that waits past the busy timeout, which the backend reads as contended', async () => {
            const impatient = store('impatient', undefined, 50);
            await impatient.query(new QuerySpecification('SELECT 1 AS one'));
            const holder = await connection('impatient');
            await holder.startTransaction();
            const failure = await impatient
                .execute(new QuerySpecification(`INSERT INTO drivine_node (labels, props) VALUES ('[]', '{}')`))
                .catch((e) => e);
            await holder.rollbackTransaction();
            await holder.release();
            expect(new SqliteBackend().contended(failure)).toBe(true);
        });

        it('should save many at once, each writer waiting its turn', async () => {
            await Promise.all(Array.from({ length: 20 }, async (_, i) => gom.save(ticket(`w${i}`, { priority: i }))));
            expect(await gom.count(Ticket)).toBe(20);
        });
    });

    describe('its schema', () => {
        const spec = rangeIndex('SqliteStore', 'title');

        afterEach(async () => {
            await gom.indexes.drop(spec);
            await gom.constraints.drop(uniquenessConstraint('Ticket', 'id'));
            await gom.indexes.drop(vectorIndex('Doc', 'embedding', 3));
            await gom.indexes.drop(fullTextIndex('Doc', 'body'));
        });

        it('should make a range index the planner reads a filter on the property and the label through', async () => {
            await gom.indexes.ensure(spec);
            const name = new SqliteGraph().objectName('ix', ['SqliteStore', 'title']);
            const statement = backendFor(DatabaseType.SQLITE).loadAllFragments(
                new ModelRegistry().fragment(Ticket),
                backendFor(DatabaseType.SQLITE).written("n.title = 'Crash'")
            );
            const plan = await rows(pm, `EXPLAIN QUERY PLAN ${statement.text.replace('/* drivine:json */\n', '')}`);
            expect(plan.map((it) => it.detail).join('\n')).toContain(name);
            expect((await gom.indexes.list()).map((it) => it.properties)).toContainEqual(['title']);
            // Dropped by hand, it is not listed, so it is made again when asked for.
            await pm.execute(new QuerySpecification(`DROP INDEX ${name}`));
            expect((await gom.indexes.list()).map((it) => it.properties)).not.toContainEqual(['title']);
        });

        it('should keep a key unique, refusing a second node that holds it', async () => {
            await gom.constraints.ensure(uniquenessConstraint('Ticket', 'id'));
            await gom.save(ticket('u1'));
            await expect(
                pm.execute(
                    new QuerySpecification(
                        `INSERT INTO drivine_node (labels, props) VALUES ('["SqliteStore","Ticket"]', '{"id":"u1"}')`
                    )
                )
            ).rejects.toThrow(/UNIQUE constraint failed/);
        });

        it('should record a vector and a full-text index, which a search reads every node for', async () => {
            await gom.indexes.ensure(vectorIndex('Doc', 'embedding', 3));
            await gom.indexes.ensure(fullTextIndex('Doc', 'body'));
            const listed = [...(await gom.indexes.list('VECTOR')), ...(await gom.indexes.list('FULLTEXT'))];
            expect(listed.filter((it) => it.label === 'Doc').map((it) => it.properties)).toEqual(
                expect.arrayContaining([['embedding'], ['body']])
            );
            const doc = (id: string, body: string, embedding: number[]): Doc =>
                Object.assign(new Doc(), { id, body, embedding });
            await gom.saveAll([doc('d1', 'graph databases', [1, 0, 0]), doc('d2', 'relational', [0, 1, 0])]);
            expect((await gom.loadNearest(Doc, [1, 0.1, 0], { topK: 1 })).map((it) => it.value.id)).toEqual(['d1']);
            expect((await gom.loadMatching(Doc, 'graph', { topK: 5 })).map((it) => it.value.id)).toEqual(['d1']);
        });
    });
});
