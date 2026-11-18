import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    CascadeType,
    CypherBackend,
    DatabaseRegistry,
    DatabaseType,
    Direction,
    GraphBackend,
    GraphRelationship,
    GraphView,
    ModelRegistry,
    NEO4J_GRAMMAR,
    NodeFragment,
    NodeId,
    nodeRef,
    OracleBackend,
    OracleGraph,
    PersistenceManager,
    PostgresBackend,
    PostgresGraph,
    QuerySpecification,
    RelateMode,
    Root,
    SqliteBackend,
    SqliteGraph,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';
import { numericText, storedKey } from '@/backend/postgres/PostgresSaveBuilder';
import { textOf } from '@/backend/sqlite/SqliteGraph';
import { openSqlite } from '@/connection/sqlite/SqliteDriver';
import { idSql } from '@/cypher/SharedCypherCompiler';
import { writeLayout } from '@/cypher/ValueLayout';
import { DrivineLogger } from '@/logger/DrivineLogger';
import { ClassType } from '@/query/QuerySpecification';
import { GraphObjectManagerFactory } from '@/manager/GraphObjectManagerFactory';
import { PersistenceManagerFactory } from '@/manager/PersistenceManagerFactory';
import { rangeIndex } from '@/schema/SchemaSpecs';
import { TransactionContextHolder } from '@/transaction/TransactonContextHolder';

/** The comparison an Oracle lookup by `$id` makes of Gauge's id, as the shared module writes it. */
const ORACLE_HAS_ID = idSql('oracle', 'hasId', 'n', 'id', 'JSON($id EXTENDED)');

@NodeFragment({ labels: ['Gauge'] })
class Gauge {
    @NodeId() id: number;
    name?: string;
}

/** A view that contains itself, so a cascading delete of it is checked first (cascadeDepthChecks). */
@GraphView()
class GaugeTree {
    @Root() gauge: Gauge;
    @GraphRelationship({ type: 'PART_OF', direction: Direction.INCOMING, target: () => GaugeTree, maxDepth: 1 })
    parts: GaugeTree[];
}

describe('storedKey', () => {
    it("is on Postgres a number's text as jsonb gives it back, numeric's, with no exponent", () => {
        expect(
            ['1.0E-7', '-1.5E-10', '1.230e-5', '2.0', '12', '0.1', '-0.0', '1.0E+2', '"1.0E-7"', '[1]'].map(numericText)
        ).toEqual(['0.00000010', '-0.00000000015', '0.00001230', '2.0', '12', '0.1', '0.0', '100', '"1.0E-7"', '[1]']);
        expect([1e-7, 4.5, 7, 'a1e-7', true].map((it) => storedKey(it, 'postgres'))).toEqual([
            '0.00000010',
            '4.5',
            '7',
            'a1e-7',
            'true'
        ]);
    });

    it("is a temporal id's tag text, as the module reads a stored target's id back (keyText)", () => {
        const day = new Date('2024-01-02T03:04:05.000Z');
        expect([storedKey(day, 'postgres'), storedKey(day, 'sqlite')]).toEqual([
            '2024-01-02T03:04:05Z',
            '2024-01-02T03:04:05Z'
        ]);
    });

    it('is on SQLite the JSON text the module writes, which SQLite reads the property back as', () => {
        expect([1e-7, 1e21, Infinity, 4.5, 7].map((it) => storedKey(it, 'sqlite'))).toEqual([
            '1.0E-7',
            '1.0E21',
            '9e999',
            '4.5',
            '7'
        ]);
        const db = openSqlite(':memory:');
        try {
            const props = JSON.stringify({ id: 0 }).replace('0', storedKey(1e-7, 'sqlite'));
            const found = db
                .prepare(`SELECT count(*) AS c FROM (SELECT ? AS props) n WHERE ${textOf('n', 'id')} = CAST(? AS TEXT)`)
                .get(props, storedKey(1e-7, 'sqlite')) as { c: number };
            expect(found.c).toEqual(1);
        } finally {
            db.close();
        }
    });
});

/**
 * A load, a delete and a relate by a float id, on Postgres and SQLite, bind the id as the JSON text the node holds it as
 * (writeLayout), which the module's hasId compares the property's JSON with: JavaScript's text of 1e-7 is `1e-7`.
 */
describe.each([
    ['Postgres', (): GraphBackend => new PostgresBackend(new PostgresGraph()), '1.0E-7'],
    ['SQLite', (): GraphBackend => new SqliteBackend(new SqliteGraph()), '1.0E-7']
])('a float id on %s', (_, backend, key) => {
    let bound: Record<string, any>[];
    let gom: StatelessGraphObjectManager;

    beforeEach(() => {
        bound = [];
        const pm = {
            database: 'id-keyed',
            query: async (spec: QuerySpecification<any>) => {
                bound.push(spec.parameters as any);
                return Promise.resolve([]);
            },
            execute: async () => Promise.resolve(),
            getOne: async (spec: QuerySpecification<any>) => {
                bound.push(spec.parameters as any);
                return Promise.resolve(0);
            }
        } as unknown as PersistenceManager;
        gom = new StatelessGraphObjectManager(pm, backend(), new ModelRegistry());
    });

    it('is bound by a load, a delete and a cascade as the JSON the node holds it as', async () => {
        await gom.load(Gauge, 1e-7);
        await gom.load(GaugeTree, 1e-7);
        await gom.delete(Gauge, 1e-7);
        await gom.delete(GaugeTree, 1e-7, { cascade: CascadeType.DELETE_ALL });
        expect(bound.map((it) => it.id)).toEqual(Array(5).fill(key));
    });

    it("is bound by a save's reads of the node's properties and stamp as the JSON the node holds it as", () => {
        const model = new ModelRegistry().fragment(Gauge);
        const held = backend().heldProperties(model).spec({ id: 1e-7 });
        const found = backend().foundStamp(model).spec({ id: 1e-7 });
        expect([(held.parameters as any).id, (found.parameters as any).id]).toEqual([key, key]);
    });

    it('is bound by loadRelated as the JSON the node holds it as', async () => {
        await gom.edges.loadRelated(nodeRef(Gauge, 1e-7), 'POINTS', undefined, Gauge);
        expect(bound.map((it) => it.x_from)).toEqual([key]);
    });

    it('reads a text id as the number a number id is, and runs nothing for a null id', async () => {
        await gom.load(Gauge, '1e-7');
        await gom.load(Gauge, null);
        expect(bound.map((it) => it.id)).toEqual([key]);
    });
});

/**
 * On Oracle a float id is held as a binary double, extended JSON's (see writeLayout): a load, a delete, a cascade's check
 * and the delete itself bind the id as that JSON text, which each reads `JSON($id EXTENDED)`, as a save finds the node. A
 * NUMBER bound as it is, 1e-7, is not always equal to the binary double held.
 */
describe('an id on Oracle', () => {
    let bound: { text: string; id: any }[];
    let gom: StatelessGraphObjectManager;

    beforeEach(() => {
        bound = [];
        const record = (spec: QuerySpecification<any>): void => {
            bound.push({ text: spec.statement.text, id: (spec.parameters as any).id });
        };
        const pm = {
            database: 'id-keyed',
            query: async (spec: QuerySpecification<any>) => {
                record(spec);
                return Promise.resolve([]);
            },
            execute: async () => Promise.resolve(),
            getOne: async (spec: QuerySpecification<any>) => {
                record(spec);
                return Promise.resolve(0);
            }
        } as unknown as PersistenceManager;
        gom = new StatelessGraphObjectManager(pm, new OracleBackend(new OracleGraph()), new ModelRegistry());
    });

    it('is bound by a load, a delete and a cascade as the JSON Oracle holds it as, read EXTENDED', async () => {
        await gom.load(Gauge, 1e-7);
        await gom.load(GaugeTree, 1e-7);
        await gom.delete(Gauge, 1e-7);
        await gom.delete(GaugeTree, 1e-7, { cascade: CascadeType.DELETE_ALL });
        expect(bound.map((it) => it.id)).toEqual(Array(5).fill('{"$numberDouble":"1.0E-7"}'));
        expect(bound.every((it) => it.text.includes(ORACLE_HAS_ID))).toBe(true);
    });

    it("binds a save's reads of the node's properties and stamp as the JSON Oracle holds the id as", () => {
        const backend = new OracleBackend(new OracleGraph());
        const model = new ModelRegistry().fragment(Gauge);
        for (const statement of [backend.heldProperties(model), backend.foundStamp(model)]) {
            expect(statement.text).toContain(ORACLE_HAS_ID);
            expect((statement.spec({ id: 1e-7 }).parameters as any).id).toEqual('{"$numberDouble":"1.0E-7"}');
        }
    });

    it("binds loadRelated's, unrelateAll's and relate's ends as the JSON Oracle holds the id as, read EXTENDED", () => {
        const backend = new OracleBackend(new OracleGraph());
        const model = new ModelRegistry().fragment(Gauge);
        const from = { model, id: 1e-7 };
        const held = '{"$numberDouble":"1.0E-7"}';
        const related = backend.related(from, 'POINTS', Direction.OUTGOING, model);
        expect(related.text).toContain(idSql('oracle', 'hasId', 'a', 'id', 'JSON($x_from EXTENDED)'));
        expect((related.spec().parameters as any).x_from).toEqual(held);
        expect((backend.unrelateAll(from, 'POINTS', Direction.OUTGOING).spec().parameters as any).x_from).toEqual(held);
        const relate = backend.relate(from, { model, id: 4.5 }, 'POINTS', {}, RelateMode.MERGE).spec()
            .parameters as any;
        expect([relate.x_from, relate.x_to]).toEqual([held, '{"$numberDouble":"4.5"}']);
        expect(relate.x_frommatch).toMatch(/PASSING JSON\(:1 EXTENDED\) AS "v"/);
    });

    it("binds a text id as the number id's JSON, and runs nothing for a null id", async () => {
        await gom.load(Gauge, '1e-7');
        await gom.load(Gauge, 7);
        await gom.load(Gauge, null);
        expect(bound.map((it) => it.id)).toEqual(['{"$numberDouble":"1.0E-7"}', '7']);
    });
});

@NodeFragment({ labels: ['Dial', 'Meter'] })
class Dial {
    @NodeId() id: number;
    name?: string;
}

@NodeFragment({ labels: ['Coded'] })
class Coded {
    @NodeId() code: string;
}

@NodeFragment({ labels: ['Dated'] })
class Dated {
    @NodeId() on: Date;
}

/** A `$`-named @NodeId, which the store layout holds under `$$code`. */
@NodeFragment({ labels: ['Priced'] })
class Priced {
    @NodeId() $code: string;
}

@NodeFragment({ labels: ['Counted'] })
class Counted {
    @NodeId() id: bigint;
}

@NodeFragment({ labels: ['Flagged'] })
class Flagged {
    @NodeId() on: boolean;
}

@GraphView()
class DialView {
    @Root() dial: Dial;
    @GraphRelationship({ type: 'READS', target: () => Coded }) codes: Coded[] = [];
}

/** A SQL store a lookup by id is written for: its backend, the SQL its id is read as, and its test of Dial's labels. */
interface LookupStore {
    name: string;
    store: 'postgres' | 'sqlite' | 'oracle';
    backend: () => GraphBackend;
    json: (parameter: string) => string;
    labels: string;
}

/**
 * Each store's lookup of a node by its id: the shared module's hasId over the id as the node holds it (idSql), beside a
 * test of every label in the form drivine4j writes beside it, and the id bound as its JSON in the store's layout.
 */
describe.each([
    {
        name: 'Postgres',
        store: 'postgres' as const,
        backend: (): GraphBackend => new PostgresBackend(new PostgresGraph()),
        json: (parameter: string): string => parameter,
        labels: `n.labels @> '["Dial"]' AND n.labels @> '["Meter"]'`
    },
    {
        name: 'SQLite',
        store: 'sqlite' as const,
        backend: (): GraphBackend => new SqliteBackend(new SqliteGraph()),
        json: (parameter: string): string => parameter,
        labels: `instr(n.labels, '"Dial"') > 0 AND instr(n.labels, '"Meter"') > 0`
    },
    {
        name: 'Oracle',
        store: 'oracle' as const,
        backend: (): GraphBackend => new OracleBackend(new OracleGraph()),
        json: (parameter: string): string => `JSON(${parameter} EXTENDED)`,
        labels:
            `INSTR(',' || LTRIM(RTRIM(JSON_SERIALIZE(n.labels), ']'), '[') || ',"', ',"Dial","') > 0 AND ` +
            `INSTR(',' || LTRIM(RTRIM(JSON_SERIALIZE(n.labels), ']'), '[') || ',"', ',"Meter","') > 0`
    }
])('a lookup by id on $name', ({ store, backend, json, labels }: LookupStore) => {
    const registry = new ModelRegistry();
    const dial = registry.fragment(Dial);
    const hasId = idSql(store, 'hasId', 'n', 'id', json('$id'));

    let bound: { text: string; parameters: Record<string, any> }[];
    let gom: StatelessGraphObjectManager;

    beforeEach(() => {
        bound = [];
        const record = (spec: QuerySpecification<any>): void => {
            bound.push({ text: spec.statement.text, parameters: spec.parameters as any });
        };
        const pm = {
            database: 'id-keyed',
            query: async (spec: QuerySpecification<any>) => {
                record(spec);
                return Promise.resolve([]);
            },
            execute: async () => Promise.resolve(),
            getOne: async (spec: QuerySpecification<any>) => {
                record(spec);
                return Promise.resolve(0);
            }
        } as unknown as PersistenceManager;
        gom = new StatelessGraphObjectManager(pm, backend(), new ModelRegistry());
    });

    it("compares the id as the module writes it, beside a test of each label by the labels' text where it must be", () => {
        const view = registry.view(DialView);
        const statements = [
            backend().loadFragment(dial),
            backend().loadView(view),
            backend().delete({ kind: 'NODE_FRAGMENT', model: dial }),
            backend().delete({ kind: 'GRAPH_VIEW', model: view }, undefined, CascadeType.DELETE_ALL),
            backend().heldProperties(dial),
            backend().foundStamp(dial)
        ];
        for (const statement of statements) {
            // A view's requirements are joined to the id's test, which is in parentheses of its own there.
            expect(statement.text.split(`${labels} AND ((${hasId}`).join(`${labels} AND (${hasId}`)).toContain(
                `${labels} AND (${hasId}`
            );
        }
    });

    it('finds the node loadRelated is from by its id, beside each of its labels', () => {
        const related = backend().related(
            { model: dial, id: 7 },
            'READS',
            Direction.OUTGOING,
            registry.fragment(Coded)
        );
        expect(related.text).toContain(
            `${idSql(store, 'hasId', 'a', 'id', json('$x_from'))} AND ${labels.replace(/\bn\.labels/g, 'a.labels')}`
        );
        expect((related.spec().parameters as any).x_from).toEqual('7');
    });

    it('binds a number, a date and a text id as the JSON the node holds each as', async () => {
        const day = new Date('2024-01-02T03:04:05.000Z');
        await gom.load(Dial, 7);
        await gom.load(Dated, day);
        await gom.load(Coded, 'abc');
        expect(bound.map((it) => it.parameters.id)).toEqual(['7', writeLayout(day, store), '"abc"']);
        expect(JSON.parse(bound[1].parameters.id)).toMatchObject({ $t: 'datetime', v: '2024-01-02T03:04:05Z' });
    });

    it('reads "6" as the number a number id is, and keeps it the text a text id is', async () => {
        await gom.load(Dial, '6');
        await gom.load(Coded, '6');
        await gom.edges.loadRelated(nodeRef(Dial, '6'), 'READS', undefined, Coded);
        expect(bound.map((it) => it.parameters.id ?? it.parameters.x_from)).toEqual(['6', '"6"', '6']);
    });

    it('reads an ISO text as the date a Date id is', async () => {
        await gom.load(Dated, '2024-01-02T03:04:05.000Z');
        expect(bound.map((it) => it.parameters.id)).toEqual([writeLayout(new Date('2024-01-02T03:04:05.000Z'), store)]);
    });

    it("reads a bigint id's text as its digits, and a boolean id's as the boolean, running nothing for other text", async () => {
        const big = BigInt('1152921504606846976');
        await gom.load(Counted, '1152921504606846976');
        await gom.load(Counted, big);
        await gom.load(Flagged, 'true');
        await gom.load(Flagged, 'false');
        for (const nothing of ['1.5', '1e3', ' 7', '']) {
            expect(await gom.load(Counted, nothing)).toBeUndefined();
        }
        expect(await gom.load(Flagged, 'yes')).toBeUndefined();
        expect(bound.map((it) => it.parameters.id)).toEqual([
            writeLayout(big, store),
            writeLayout(big, store),
            'true',
            'false'
        ]);
    });

    it('runs no statement for text that is no value of the id, logging it at DEBUG alone', async () => {
        const debug = jest.spyOn(DrivineLogger.prototype, 'debug');
        const warn = jest.spyOn(DrivineLogger.prototype, 'warn');
        const error = jest.spyOn(DrivineLogger.prototype, 'error');
        try {
            const nowhere = nodeRef(Dial, 'abc');
            const coded = nodeRef(Coded, 'x');
            expect(await gom.load(Dial, 'abc')).toBeUndefined();
            expect(await gom.load(DialView, 'abc')).toBeUndefined();
            expect(await gom.delete(Dial, 'abc')).toEqual(0);
            expect(await gom.patch(Dial, 'abc', { set: { name: 'x' } })).toEqual({
                found: false,
                applied: false,
                changed: false
            });
            expect(await gom.update(Dial, 'abc', (it) => it)).toBeUndefined();
            expect(await gom.edges.loadRelated(nowhere, 'READS', undefined, Coded)).toEqual([]);
            expect(await gom.edges.relate(nowhere, coded, 'READS')).toBe(false);
            expect(await gom.edges.relate(coded, nowhere, 'READS')).toBe(false);
            expect(await gom.edges.unrelate(nowhere, coded, 'READS')).toEqual(0);
            expect(await gom.edges.unrelateAll(nowhere, 'READS')).toEqual(0);
            expect(await gom.load(Dated, 'not a day')).toBeUndefined();
            expect(bound).toEqual([]);
            expect(debug.mock.calls.map(([message]) => message)).toContainEqual(
                "No Dial is looked for by the id 'abc': it is no value of id's type, so no node has it."
            );
            expect(warn).not.toHaveBeenCalled();
            expect(error).not.toHaveBeenCalled();
        } finally {
            debug.mockRestore();
            warn.mockRestore();
            error.mockRestore();
        }
    });

    it('runs no statement for a patch, a load or a delete by a null id, which finds no node (#773)', async () => {
        expect(await gom.patch(Coded, null, { set: {} })).toEqual({ found: false, applied: false, changed: false });
        expect(await gom.load(Coded, null)).toBeUndefined();
        expect(await gom.delete(Coded, undefined)).toEqual(0);
        expect(bound).toEqual([]);
    });

    it('finds a node of a $-named id by the key the layout holds it under', () => {
        const priced = registry.fragment(Priced);
        expect(backend().loadFragment(priced).text).toContain(idSql(store, 'hasId', 'n', '$$code', json('$id')));
    });
});

describe('idSql', () => {
    it("throws the module's refusal, by the helper and the store, for a request it writes no SQL for", () => {
        expect(() => idSql('sqlite', 'hasId', 'n', 'id')).toThrow(
            "The shared module wrote no hasId for sqlite: idSql's hasId gives json as text."
        );
    });
});

describe('a lookup by id on a graph engine', () => {
    it('binds text as it is given: the engine compares it', async () => {
        const bound: any[] = [];
        const pm = {
            database: 'id-keyed',
            query: async (spec: QuerySpecification<any>) => {
                bound.push((spec.parameters as any).id);
                return Promise.resolve([]);
            }
        } as unknown as PersistenceManager;
        const gom = new StatelessGraphObjectManager(pm, new CypherBackend(NEO4J_GRAMMAR), new ModelRegistry());
        await gom.load(Dial, '6');
        await gom.load(Dial, 'abc');
        expect(bound).toEqual(['6', 'abc']);
    });
});

/**
 * A lookup by id on SQLite reads the index the library itself makes over the id, as layout 2 makes it, by both its
 * columns, the id's class and key: a range index (`gom.indexes`) on one label and a uniqueness constraint's index
 * (`gom.constraints`) on the other, each made by the shared module's schema plan. SQLite's planner, in process, says
 * which index it uses.
 */
describe('a lookup by id on SQLite, planned', () => {
    let folder: string;
    let pm: PersistenceManager;
    const backend = new SqliteBackend(new SqliteGraph());
    const registry = new ModelRegistry();

    beforeAll(async () => {
        folder = fs.mkdtempSync(path.join(os.tmpdir(), 'drivine-id-planned-'));
        DatabaseRegistry.getInstance()
            .builder()
            .withProperties({ databaseType: DatabaseType.SQLITE, host: '', databaseName: path.join(folder, 'ids.db') })
            .register('id-planned');
        const factory = new PersistenceManagerFactory(
            DatabaseRegistry.getInstance(),
            TransactionContextHolder.getInstance()
        );
        pm = factory.get('id-planned', 'NON_TRANSACTIONAL');
        const gom = new GraphObjectManagerFactory(factory).get('id-planned');
        await gom.indexes.ensure(rangeIndex('Dial', 'id'));
        await gom.constraints.ensure({ kind: 'UNIQUE', label: 'Dated', properties: ['on'] });
    });

    afterAll(async () => {
        await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
        DatabaseRegistry.tearDown();
        fs.rmSync(folder, { recursive: true, force: true });
    });

    const plan = async (text: string, bindings: Record<string, any>): Promise<string> =>
        (await pm.query<any>(new QuerySpecification(`EXPLAIN QUERY PLAN ${text}`).bind(bindings)))
            .map((it) => it.detail)
            .join('\n');

    it.each([
        ['a number', Dial, 7, 'ix2_Dialid'],
        ['a date', Dated, new Date('2024-01-02T00:00:00.000Z'), 'uq2_Datedon']
    ])('reads the index for %s id, by a load, a delete and loadRelated', async (_, type, id, made) => {
        const model = registry.fragment(type as ClassType);
        const index = (alias: string): RegExp =>
            new RegExp(`SEARCH ${alias} USING (COVERING )?INDEX drivine_${made}_\\w+ \\(<expr>=\\? AND <expr>=\\?\\)`);
        const bound = { id: writeLayout(id, 'sqlite') };
        expect(await plan(backend.loadFragment(model).text, bound)).toMatch(index('n'));
        expect(await plan(backend.delete({ kind: 'NODE_FRAGMENT', model }).text, bound)).toMatch(index('n'));
        const related = backend.related({ model, id }, 'READS', Direction.OUTGOING, registry.fragment(Coded));
        expect(await plan(related.text, related.bindings)).toMatch(index('a'));
    });
});
