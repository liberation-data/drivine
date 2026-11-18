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
    NodeStamp,
    NodeId,
    nodeRef,
    OracleBackend,
    OracleGraph,
    PersistenceManager,
    PostgresBackend,
    PostgresGraph,
    QuerySpecification,
    RelateMode,
    RemovedTargets,
    Root,
    SqliteBackend,
    SqliteGraph,
    StaleObjectException,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';
import { FoundStamp } from '@/backend/postgres/FoundStamp';
import { numericText, storedKey } from '@/backend/postgres/PostgresSaveBuilder';
import { textOf } from '@/backend/sqlite/SqliteGraph';
import { DSL_ROW } from '@/backend/sql/FragmentQueryRenderer';
import { GraphStatement } from '@/backend/GraphStatement';
import { openSqlite } from '@/connection/sqlite/SqliteDriver';
import { idSql } from '@/cypher/SharedCypherCompiler';
import { writeLayout } from '@/cypher/ValueLayout';
import { FALKORDB_GRAMMAR } from '@/backend/CypherGrammar';
import { toFixedWidthIso } from '@/connection/falkordb/FalkorDbParameterCoercer';
import { DrivineLogger } from '@/logger/DrivineLogger';
import { ClassType } from '@/query/QuerySpecification';
import { GraphObjectManagerFactory } from '@/manager/GraphObjectManagerFactory';
import { PersistenceManagerFactory } from '@/manager/PersistenceManagerFactory';
import { rangeIndex } from '@/schema/SchemaSpecs';
import { TransactionContextHolder } from '@/transaction/TransactonContextHolder';

/** The comparison an Oracle load or delete by `$id` makes of Gauge's id, as the shared module writes it, over the query DSL's row `n_`. */
const ORACLE_HAS_ID = idSql('oracle', 'hasId', DSL_ROW, 'id', 'JSON($id EXTENDED)');

/** The row an Oracle write block's find binds its one id in, as `i.v`, read EXTENDED. */
const ONE_ID = '(SELECT JSON(:1 EXTENDED) v FROM dual) i';

/** The comparison an Oracle write block makes of the node `f`'s id `key` with the bound row's `i.v`. */
const writeHasId = (key: string, alias: string = 'f'): string => idSql('oracle', 'hasId', alias, key, 'i.v');

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
        // A write's own reads keep the row `n`.
        for (const statement of [backend.heldProperties(model), backend.foundStamp(model)]) {
            expect(statement.text).toContain(idSql('oracle', 'hasId', 'n', 'id', 'JSON($id EXTENDED)'));
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
        expect(relate.x_frommatch).toContain(`${ONE_ID} CROSS JOIN drivine_node f WHERE ${writeHasId('id')}`);
    });

    it("binds loadRelated's, unrelateAll's, relate's and unrelate's null ends as they are, so they find no node (#772)", () => {
        const backend = new OracleBackend(new OracleGraph());
        const model = new ModelRegistry().fragment(Gauge);
        const from = { model, id: null };
        expect((backend.related(from, 'POINTS', Direction.OUTGOING, model).spec().parameters as any).x_from).toBeNull();
        expect((backend.unrelateAll(from, 'POINTS', Direction.OUTGOING).spec().parameters as any).x_from).toBeNull();
        const relate = backend.relate(from, { model, id: null }, 'POINTS', {}, RelateMode.MERGE).spec()
            .parameters as any;
        expect([relate.x_from, relate.x_to]).toEqual([null, null]);
        const unrelate = backend.unrelate(from, { model, id: null }, 'POINTS').spec().parameters as any;
        expect([unrelate.x_from, unrelate.x_to]).toEqual([null, null]);
    });

    it("binds a text id as the number id's JSON, and runs nothing for a null id", async () => {
        await gom.load(Gauge, '1e-7');
        await gom.load(Gauge, 7);
        await gom.load(Gauge, null);
        expect(bound.map((it) => it.id)).toEqual(['{"$numberDouble":"1.0E-7"}', '7']);
    });

    // A null id written as the JSON text 'null' was read by the block's find_node as JSON's null, so a patch could reach a
    // node whose id is held as null, where a load or a delete by a null id finds none (#772). A null id now runs no
    // statement at all, and a float id is bound as the JSON Oracle holds it as.
    it("runs no statement for a patch's null id, and binds a float id as the JSON Oracle holds it as", async () => {
        await gom.patch(Gauge, null as any, { set: { name: 'x' } }).catch(() => undefined);
        await gom.patch(Gauge, 1e-7, { set: { name: 'x' } }).catch(() => undefined);
        expect(bound.map((it) => it.id)).toEqual(['{"$numberDouble":"1.0E-7"}']);
        // The block itself, reached with a null id, binds it as it is, never as the text 'null'.
        const patch = new OracleBackend(new OracleGraph()).patchOne(new ModelRegistry().fragment(Gauge));
        expect((patch.spec({ id: null, set: {} }).parameters as any).id).toBeNull();
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
    /** The row a load and a delete by id read the node as. */
    row: string;
    /** The test of each of Dial's labels on the row `row`. */
    labels: (row: string) => string;
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
        // A load and a delete read the node as the query DSL's row, which a fragment's variable ends with `_`.
        row: DSL_ROW,
        labels: (row: string): string => `${row}.labels @> '["Dial"]' AND ${row}.labels @> '["Meter"]'`
    },
    {
        name: 'SQLite',
        store: 'sqlite' as const,
        backend: (): GraphBackend => new SqliteBackend(new SqliteGraph()),
        json: (parameter: string): string => parameter,
        // A load and a delete read the node as the query DSL's row, which a fragment's variable ends with `_`.
        row: DSL_ROW,
        labels: (row: string): string => `instr(${row}.labels, '"Dial"') > 0 AND instr(${row}.labels, '"Meter"') > 0`
    },
    {
        name: 'Oracle',
        store: 'oracle' as const,
        backend: (): GraphBackend => new OracleBackend(new OracleGraph()),
        json: (parameter: string): string => `JSON(${parameter} EXTENDED)`,
        // A load and a delete read the node as the query DSL's row, which a fragment's variable ends with `_`.
        row: DSL_ROW,
        labels: (row: string): string =>
            `INSTR(',' || LTRIM(RTRIM(JSON_SERIALIZE(${row}.labels), ']'), '[') || ',"', ',"Dial","') > 0 AND ` +
            `INSTR(',' || LTRIM(RTRIM(JSON_SERIALIZE(${row}.labels), ']'), '[') || ',"', ',"Meter","') > 0`
    }
])('a lookup by id on $name', ({ store, backend, json, row, labels }: LookupStore) => {
    const registry = new ModelRegistry();
    const dial = registry.fragment(Dial);

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
        // A write's reads, heldProperties and foundStamp, read the node as `n` on every store.
        const statements: [GraphStatement, string][] = [
            [backend().loadFragment(dial), row],
            [backend().loadView(view), row],
            [backend().delete({ kind: 'NODE_FRAGMENT', model: dial }), row],
            [backend().delete({ kind: 'GRAPH_VIEW', model: view }, undefined, CascadeType.DELETE_ALL), row],
            [backend().heldProperties(dial), 'n'],
            [backend().foundStamp(dial), 'n']
        ];
        for (const [statement, alias] of statements) {
            const hasId = idSql(store, 'hasId', alias, 'id', json('$id'));
            // A view's requirements are joined to the id's test, which is in parentheses of its own there.
            expect(
                statement.text.split(`${labels(alias)} AND ((${hasId}`).join(`${labels(alias)} AND (${hasId}`)
            ).toContain(`${labels(alias)} AND (${hasId}`);
        }
    });

    it('finds the node loadRelated is from by its id, beside each of its labels', () => {
        const related = backend().related(
            { model: dial, id: 7 },
            'READS',
            Direction.OUTGOING,
            registry.fragment(Coded)
        );
        expect(related.text).toContain(`${idSql(store, 'hasId', 'a', 'id', json('$x_from'))} AND ${labels('a')}`);
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

    it('reads an ISO text with no offset as UTC, as a day is, and a fraction past milliseconds as no Date', async () => {
        // JavaScript reads a time with no offset as local time, and drops a fraction's digits past the third.
        await gom.load(Dated, '2024-01-02T03:04:05');
        await gom.load(Dated, '2024-01-02T03:04:05.1230');
        expect(await gom.load(Dated, '2024-01-02T03:04:05.1239Z')).toBeUndefined();
        expect(bound.map((it) => it.parameters.id)).toEqual([
            writeLayout(new Date('2024-01-02T03:04:05.000Z'), store),
            writeLayout(new Date('2024-01-02T03:04:05.123Z'), store)
        ]);
    });

    it('runs nothing for an ISO text of no calendar day or hour, which JavaScript would roll into the next', async () => {
        // A year of -0 too, which ISO 8601 has no sign for: JavaScript reads '-000000-01-01' as 1 January 2001.
        for (const nothing of [
            '2024-02-30',
            '2023-02-29',
            '2024-04-31T00:00:00Z',
            '2024-01-01T24:00:00Z',
            '-000000-01-01',
            '-00000-01-01'
        ]) {
            expect(await gom.load(Dated, nothing)).toBeUndefined();
        }
        await gom.load(Dated, '2024-02-29');
        expect(bound.map((it) => it.parameters.id)).toEqual([writeLayout(new Date('2024-02-29'), store)]);
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

    it('refuses a patch of a field no patch writes by an id that finds no node, as by one that finds one', async () => {
        for (const id of [null, 'abc', 7]) {
            await expect(gom.patch(Dial, id, { set: { id: 5 } })).rejects.toThrow("A patch can't write id of Dial.");
            await expect(gom.patch(Dial, id, { set: { name: 'a' }, clear: ['name'] })).rejects.toThrow(
                'A patch names each field once.'
            );
        }
        expect(bound).toEqual([]);
    });

    it('finds a node of a $-named id by the key the layout holds it under', () => {
        const priced = registry.fragment(Priced);
        expect(backend().loadFragment(priced).text).toContain(idSql(store, 'hasId', row, '$$code', json('$id')));
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
        expect(await plan(backend.loadFragment(model).text, bound)).toMatch(index(DSL_ROW));
        expect(await plan(backend.delete({ kind: 'NODE_FRAGMENT', model }).text, bound)).toMatch(index(DSL_ROW));
        const related = backend.related({ model, id }, 'READS', Direction.OUTGOING, registry.fragment(Coded));
        expect(await plan(related.text, related.bindings)).toMatch(index('a'));
    });

    it("reads the index by the row each by-id statement's FROM declares: a view's load and deletes, a write's reads", async () => {
        const model = registry.fragment(Dial);
        const view = registry.view(DialView);
        const index = (alias: string): RegExp =>
            new RegExp(
                `SEARCH ${alias} USING (COVERING )?INDEX drivine_ix2_Dialid_\\w+ \\(<expr>=\\? AND <expr>=\\?\\)`
            );
        const bound = { id: writeLayout(7, 'sqlite') };
        const target = { kind: 'GRAPH_VIEW' as const, model: view };
        for (const statement of [
            backend.loadView(view),
            backend.delete(target),
            backend.delete(target, undefined, CascadeType.DELETE_ALL),
            backend.delete(target, undefined, CascadeType.DELETE_ORPHAN)
        ]) {
            expect(await plan(statement.text, bound)).toMatch(index(DSL_ROW));
        }
        // A write's reads of the node it saves read it as `n`, as the write itself does.
        expect(await plan(backend.heldProperties(model).text, bound)).toMatch(index('n'));
        expect(await plan(backend.foundStamp(model).text, bound)).toMatch(index('n'));
    });
});

@NodeFragment({ labels: ['StampedDay'] })
class StampedDay {
    @NodeId() on: Date;
    @NodeStamp() stamp?: string;
    note?: string;
}

@NodeFragment({ labels: ['StampedCount'] })
class StampedCount {
    @NodeId() n: bigint;
    @NodeStamp() stamp?: string;
}

describe('a batch handing back stamps', () => {
    // Oracle's fragment batch reads each node's id back from its tag, as the tag's text, where the object holds a Date: a
    // Map finds a Date by the object, so the two are matched by that text.
    it("hands each stamped node its stamp by its Date id's text, as the store reads it back", () => {
        const model = new ModelRegistry().fragment(StampedDay);
        const day = (): StampedDay => Object.assign(new StampedDay(), { on: new Date('2024-01-03T00:00:00.000Z') });
        const days = [day(), day()];
        const text = JSON.parse(writeLayout(days[0].on, 'sqlite')).v;
        const stamp = `${'a'.repeat(16)}:${'b'.repeat(16)}`;
        const gom = new StatelessGraphObjectManager(
            {} as any,
            new OracleBackend(new OracleGraph()),
            new ModelRegistry()
        );
        (gom as any).handBackFragments([{ model, objects: days }], {
            groups: [{ before: [], after: [{ id: text, stamp }] }]
        });
        expect(days.map((it) => it.stamp)).toEqual([stamp, stamp]);
    });

    it('hands a stamped node with a bigint id its stamp by the number Oracle reads it back as', () => {
        const model = new ModelRegistry().fragment(StampedCount);
        const count = Object.assign(new StampedCount(), { n: BigInt(5) });
        const stamp = `${'a'.repeat(16)}:${'b'.repeat(16)}`;
        const gom = new StatelessGraphObjectManager(
            {} as any,
            new OracleBackend(new OracleGraph()),
            new ModelRegistry()
        );
        (gom as any).handBackFragments([{ model, objects: [count] }], {
            groups: [{ before: [], after: [{ id: 5, stamp }] }]
        });
        expect(count.stamp).toEqual(stamp);
    });

    it("hands a stamped related node with a Date id its stamp by its id's text, as Oracle reads it back", () => {
        const model = new ModelRegistry().fragment(StampedDay);
        const day = Object.assign(new StampedDay(), { on: new Date('2024-01-03T00:00:00.000Z') });
        const stamp = `${'a'.repeat(16)}:${'b'.repeat(16)}`;
        const gom = new StatelessGraphObjectManager(
            {} as any,
            new OracleBackend(new OracleGraph()),
            new ModelRegistry()
        );
        (gom as any).handBackRelated(
            { day },
            { stampedModels: [model] },
            {
                related: [{ before: [], after: [{ id: JSON.parse(writeLayout(day.on, 'oracle')).v, stamp }] }]
            }
        );
        expect(day.stamp).toEqual(stamp);
    });
});

@GraphView()
class DialDays {
    @Root() dial: Dial;
    @GraphRelationship({ type: 'ON', target: () => StampedDay }) days: StampedDay[] = [];
}

describe('a Date id matched by its time', () => {
    const on = (): Date => new Date('2024-01-03T00:00:00.000Z');

    it('is matched to its patch result where Neo4j hands the id back as another Date, and taken once', async () => {
        const pm = {
            database: 'id-keyed',
            query: async () => Promise.resolve([{ id: on(), found: true, changed: true }])
        } as unknown as PersistenceManager;
        const gom = new StatelessGraphObjectManager(pm, new CypherBackend(NEO4J_GRAMMAR), new ModelRegistry());
        const day = Object.assign(new StampedDay(), { on: on(), note: 'x' });
        expect(await gom.patchAll([day], { only: ['note'] })).toEqual([{ found: true, applied: true, changed: true }]);
        await expect(
            gom.patchAll([day, Object.assign(new StampedDay(), { on: on() })], { only: ['note'] })
        ).rejects.toThrow('patchAll takes each id once.');
    });

    // FalkorDB holds a Date as its text with nine digits of the second, and hands that text back: a patch's row id as
    // bound, and a batch's id as the node holds it.
    it('is matched to its patch result and its stamp by the text FalkorDB hands a Date id back as', async () => {
        const pm = {
            database: 'id-keyed',
            query: async () => Promise.resolve([{ id: toFixedWidthIso(on()), found: true, changed: true }])
        } as unknown as PersistenceManager;
        const gom = new StatelessGraphObjectManager(pm, new CypherBackend(FALKORDB_GRAMMAR), new ModelRegistry());
        const day = Object.assign(new StampedDay(), { on: on(), note: 'x' });
        expect(await gom.patchAll([day], { only: ['note'] })).toEqual([{ found: true, applied: true, changed: true }]);
        const stamp = `${'a'.repeat(16)}:${'b'.repeat(16)}`;
        (gom as any).handBackFragments([{ model: new ModelRegistry().fragment(StampedDay), objects: [day] }], {
            groups: [{ before: [], after: [{ id: toFixedWidthIso(on()), stamp }] }]
        });
        expect(day.stamp).toEqual(stamp);
    });

    it("is an update's same id, where the copy taken before the change holds it as another Date", () => {
        const model = new ModelRegistry().fragment(StampedDay);
        const gom = new StatelessGraphObjectManager({} as any, new CypherBackend(NEO4J_GRAMMAR), new ModelRegistry());
        const day = Object.assign(new StampedDay(), { on: on(), stamp: `${'a'.repeat(16)}:`, note: 'x' });
        const before = Object.assign(new StampedDay(), { ...day, on: on() });
        day.note = 'y';
        expect((gom as any).changeOf({ kind: 'NODE_FRAGMENT', model }, before, day).only).toEqual(['note']);
    });

    it('is the same related target after an update, where the copy taken before the change holds it as another Date', () => {
        const model = new ModelRegistry().view(DialDays);
        const gom = new StatelessGraphObjectManager({} as any, new CypherBackend(NEO4J_GRAMMAR), new ModelRegistry());
        const view = (): DialDays =>
            Object.assign(new DialDays(), {
                dial: Object.assign(new Dial(), { id: 1, name: 'x' }),
                days: [Object.assign(new StampedDay(), { on: on() })]
            });
        expect((gom as any).changeOf({ kind: 'GRAPH_VIEW', model }, view(), view()).replace).toBeUndefined();
    });

    it('is loaded again and saved again by an update whose save was stale, where the save holds it as another Date', async () => {
        const gom = new StatelessGraphObjectManager({} as any, new CypherBackend(NEO4J_GRAMMAR), new ModelRegistry());
        const loaded = (): StampedDay => Object.assign(new StampedDay(), { on: on(), stamp: `${'a'.repeat(16)}:` });
        (gom as any).loadRow = async () => Promise.resolve({ object: loaded() });
        let writes = 0;
        (gom as any).write = async (object: StampedDay) => {
            writes++;
            if (writes === 1) {
                throw new StaleObjectException(StampedDay, on(), 'a', 'b', false);
            }
            return Promise.resolve(object);
        };
        const saved = await gom.update(StampedDay, on(), (it) => {
            it.note = 'y';
        });
        expect([saved?.note, writes]).toEqual(['y', 2]);
    });

    // A SQL store loads a Date id as its tag's text, `v`.
    const text = (): string => JSON.parse(writeLayout(on(), 'sqlite')).v;

    it("is loaded again and saved again by an update whose save was stale, where a SQL store loaded it as its tag's text", async () => {
        const gom = new StatelessGraphObjectManager(
            {} as any,
            new SqliteBackend(new SqliteGraph()),
            new ModelRegistry()
        );
        const loaded = (): StampedDay => Object.assign(new StampedDay(), { on: text(), stamp: `${'a'.repeat(16)}:` });
        (gom as any).loadRow = async () => Promise.resolve({ object: loaded() });
        let writes = 0;
        (gom as any).write = async (object: StampedDay) => {
            writes++;
            if (writes === 1) {
                throw new StaleObjectException(StampedDay, object.on, 'a', 'b', false);
            }
            return Promise.resolve(object);
        };
        const saved = await gom.update(StampedDay, on(), (it) => {
            it.note = 'y';
        });
        expect([saved?.note, writes]).toEqual(['y', 2]);
    });

    it("is an update's same id and related target, where a SQL store loaded it as its tag's text", () => {
        const gom = new StatelessGraphObjectManager(
            {} as any,
            new SqliteBackend(new SqliteGraph()),
            new ModelRegistry()
        );
        const model = new ModelRegistry().fragment(StampedDay);
        const day = Object.assign(new StampedDay(), { on: text(), note: 'x' });
        const changed = Object.assign(new StampedDay(), { on: on(), note: 'y' });
        expect((gom as any).changeOf({ kind: 'NODE_FRAGMENT', model }, day, changed).only).toEqual(['note']);
        const view = (id: unknown): DialDays =>
            Object.assign(new DialDays(), {
                dial: Object.assign(new Dial(), { id: 1, name: 'x' }),
                days: [Object.assign(new StampedDay(), { on: id })]
            });
        const target = { kind: 'GRAPH_VIEW', model: new ModelRegistry().view(DialDays) };
        expect((gom as any).changeOf(target, view(text()), view(on())).replace).toBeUndefined();
    });

    it("is the id of a save's from, where a SQL store loaded it as its tag's text, and not a Date a millisecond on", () => {
        const gom = new StatelessGraphObjectManager(
            {} as any,
            new SqliteBackend(new SqliteGraph()),
            new ModelRegistry()
        );
        const target = { kind: 'NODE_FRAGMENT', model: new ModelRegistry().fragment(StampedDay) };
        const from = Object.assign(new StampedDay(), { on: text(), stamp: `${'a'.repeat(16)}:` });
        const saved = Object.assign(new StampedDay(), { on: on(), note: 'y' });
        expect((gom as any).loadedAs(target, saved, from).root).toBe(from);
        const later = Object.assign(new StampedDay(), { on: new Date(on().getTime() + 1) });
        expect(() => (gom as any).loadedAs(target, later, from)).toThrow('Give the object as it was loaded.');
    });

    it('hands a stamped node of a Date id past the year 9999 its stamp by the five-digit year Oracle reads it back as', () => {
        const model = new ModelRegistry().fragment(StampedDay);
        const day = Object.assign(new StampedDay(), { on: new Date('+012345-01-03T00:00:00.000Z') });
        const id = JSON.parse(writeLayout(day.on, 'oracle')).v;
        expect(id).toEqual('+12345-01-03T00:00:00Z');
        const stamp = `${'a'.repeat(16)}:${'b'.repeat(16)}`;
        const gom = new StatelessGraphObjectManager(
            {} as any,
            new OracleBackend(new OracleGraph()),
            new ModelRegistry()
        );
        (gom as any).handBackFragments([{ model, objects: [day] }], {
            groups: [{ before: [], after: [{ id, stamp }] }]
        });
        expect(day.stamp).toEqual(stamp);
    });

    it('is one node of a save that holds it twice, as two objects, each with a Date of its own', () => {
        const handed = new Map([
            ['0', { group: 0, id: on() }],
            ['1', { group: 0, id: on() }]
        ]);
        const [held] = FoundStamp.grouped(['0/a:=b:', '1/b:=c:'], 1, handed);
        expect([held.before.map((it) => it.stamp), held.after.map((it) => it.stamp)]).toEqual([['a:'], ['c:']]);
    });
});

/** An id whose field takes a Date and text alike (design:type Object): a Date and its ISO text are two nodes. */
@NodeFragment({ labels: ['StampedMark'] })
class StampedMark {
    @NodeId() mark: string | Date;
    @NodeStamp() stamp?: string;
    note?: string;
}

describe('a Date id and its text, where the id field takes both', () => {
    const on = (): Date => new Date('2024-01-03T00:00:00.000Z');
    const marks = (): StampedMark[] => [
        Object.assign(new StampedMark(), { mark: on(), note: 'x' }),
        Object.assign(new StampedMark(), { mark: on().toISOString(), note: 'x' })
    ];

    it('are two nodes of a save, each handed its own stamp, where Postgres hands each id back as it was given', () => {
        const handed = new Map([
            ['0', { group: 0, id: on() }],
            ['1', { group: 0, id: on().toISOString() }]
        ]);
        const [held] = FoundStamp.grouped(['0/=a:', '1/=b:'], 1, handed);
        expect(held.after.map((it) => it.stamp)).toEqual(['a:', 'b:']);
        const objects = marks();
        const gom = new StatelessGraphObjectManager(
            {} as any,
            new PostgresBackend(new PostgresGraph()),
            new ModelRegistry()
        );
        const model = new ModelRegistry().fragment(StampedMark);
        (gom as any).handBackFragments([{ model, objects }], { groups: [held] });
        expect(objects.map((it) => it.stamp)).toEqual(['a:', 'b:']);
        const related = marks();
        (gom as any).handBackRelated({ related }, { stampedModels: [model] }, { related: [held] });
        expect(related.map((it) => it.stamp)).toEqual(['a:', 'b:']);
    });

    it('are two nodes of a patchAll, each matched to its own result', async () => {
        const pm = {
            database: 'id-keyed',
            query: async () =>
                Promise.resolve([
                    { id: on().toISOString(), found: false, changed: false },
                    { id: on(), found: true, changed: true }
                ])
        } as unknown as PersistenceManager;
        const gom = new StatelessGraphObjectManager(pm, new PostgresBackend(new PostgresGraph()), new ModelRegistry());
        expect(await gom.patchAll(marks(), { only: ['note'] })).toEqual([
            { found: true, applied: true, changed: true },
            { found: false, applied: false, changed: false }
        ]);
    });
});

/**
 * Each Oracle write block finds a node by its id as the shared module's hasId compares it, the property's class and key
 * with the id's, which the index over the id is made over (#754): the id bound once, in a row of its own, read EXTENDED,
 * since the comparison reads it more than once and a dynamic statement's binds are by position. A list of ids, a fragment
 * batch's or a save's stamped related nodes, or a trim's, is a row for each id, read EXTENDED, so a float is the binary
 * double the node holds.
 */
describe("an Oracle write block's id", () => {
    const backend = new OracleBackend(new OracleGraph());
    const registry = new ModelRegistry();
    const occurrences = (text: string, needle: string): number => text.split(needle).length - 1;
    const HINT = '/*+ NO_JSON_TABLE_TRANSFORM */';
    /** Each id list's rows, bound as `list`. */
    const rows = (list: string): string => `JSON_TABLE(JSON(${list} EXTENDED), '$[*]' COLUMNS (v JSON PATH '$')) i`;

    /** The bound match of a find_node or a write_node: the node of `labels` whose id `key` is the one bound `:1`. */
    const expectMatch = (match: string, key: string, labels: string[]): void => {
        expect(match).toEqual(
            `n.nid IN (SELECT /*+ NO_JSON_TABLE_TRANSFORM */ f.nid + 0 FROM ${ONE_ID} CROSS JOIN drivine_node f WHERE ${writeHasId(
                key
            )} AND ${labels
                .map((it) => `INSTR(',' || LTRIM(RTRIM(JSON_SERIALIZE(f.labels), ']'), '[') || ',"', ',"${it}","') > 0`)
                .join(' AND ')})`
        );
        expect(occurrences(match, ':1')).toBe(1);
        expect(match).not.toContain('PASSING');
    };

    /** The bound texts among `parameters` that are a find_node's or a write_node's match. */
    const matches = (parameters: Record<string, any>): string[] =>
        Object.values(parameters).filter((it): it is string => typeof it === 'string' && it.includes(ONE_ID));

    it("finds a patch's, a patchAll's, a relate's, an unrelate's and an unrelateAll's node by hasId, the id bound once", () => {
        const priced = registry.fragment(Priced);
        const dated = registry.fragment(Dated);
        expectMatch((backend.patchOne(priced).spec({ id: 'p', set: {} }).parameters as any).x_match, '$$code', [
            'Priced'
        ]);
        expectMatch((backend.patchMany(dated).spec({ rows: [] }).parameters as any).x_match, 'on', ['Dated']);
        const from = { model: priced, id: 'p' };
        const to = { model: dated, id: new Date('2024-01-02T00:00:00.000Z') };
        for (const statement of [
            backend.relate(from, to, 'ON', {}, RelateMode.MERGE),
            backend.relate(from, to, 'ON', {}, RelateMode.CREATE),
            backend.unrelate(from, to, 'ON')
        ]) {
            const parameters = statement.spec().parameters as any;
            expectMatch(parameters.x_frommatch, '$$code', ['Priced']);
            expectMatch(parameters.x_tomatch, 'on', ['Dated']);
            expect(parameters.x_to).toEqual(writeLayout(to.id, 'oracle'));
        }
        const all = backend.unrelateAll(from, 'ON', Direction.OUTGOING).spec().parameters as any;
        expectMatch(all.x_frommatch, '$$code', ['Priced']);
        // Each of a node's labels is told by its text, as a lookup by id tells them.
        expectMatch(
            (backend.patchOne(registry.fragment(Dial)).spec({ id: 1, set: {} }).parameters as any).x_match,
            'id',
            ['Dial', 'Meter']
        );
    });

    it("finds each node of a fragment batch by hasId, and reads their stamps by hasId over each id's row", () => {
        const model = registry.fragment(StampedDay);
        const days = ['2024-01-02', '2024-01-03'].map((it) =>
            Object.assign(new StampedDay(), { on: new Date(`${it}T00:00:00.000Z`) })
        );
        const statement = backend.fragmentBatch([{ model, objects: days }], {});
        const parameters = statement.spec().parameters as Record<string, any>;
        const found = matches(parameters);
        expect(found).toHaveLength(2);
        found.forEach((it) => expectMatch(it, 'on', ['StampedDay']));
        // Read before and after the writes, each id of the list a row, which finds its node through the index.
        const reads = `n.nid IN (SELECT /*+ NO_JSON_TABLE_TRANSFORM */ f.nid + 0 FROM ${rows(
            '$x_1'
        )} CROSS JOIN drivine_node f WHERE ${writeHasId('on')}`;
        expect(statement.text).toContain(reads);
        // The read itself reads each node's props beside the lookup's, so it is planned without the transformation too.
        expect(occurrences(statement.text, `SELECT ${HINT} NVL(JSON_ARRAYAGG(`)).toBe(2);
        expect(occurrences(statement.text, `CROSS JOIN drivine_node f WHERE ${writeHasId('on')}`)).toBe(2);
        expect(parameters.x_1).toEqual(writeLayout([days[0].on, days[1].on], 'oracle'));
        expect(statement.text).not.toContain('PASSING t.v');
    });

    it("finds a save's nodes by hasId, trims a replaced list by hasId over each id kept, and reads related stamps so", () => {
        const view = registry.view(DialDays);
        const kept = Object.assign(new StampedDay(), { on: new Date('2024-01-02T00:00:00.000Z') });
        const object = Object.assign(new DialDays(), { dial: Object.assign(new Dial(), { id: 1.5 }), days: [kept] });
        const statement = backend.save({ kind: 'GRAPH_VIEW', model: view }, object, {
            replace: ['days'],
            removedTargets: RemovedTargets.DELETE_UNREFERENCED
        });
        const parameters = statement.spec().parameters as Record<string, any>;
        const found = matches(parameters);
        expect(found).toHaveLength(2);
        expectMatch(found[0], 'id', ['Dial', 'Meter']);
        expectMatch(found[1], 'on', ['StampedDay']);

        // The trim's two statements test each target joined to the root against the rows of the ids kept, bound :2, each
        // planned without Oracle's JSON table transformation, which lost a node's tests beside another table (spec#415).
        const trims = Object.values(parameters).filter(
            (it): it is string => typeof it === 'string' && it.includes(writeHasId('on', 'x'))
        );
        expect(trims).toHaveLength(2);
        for (const trim of trims) {
            expect(trim).toContain(
                `NOT EXISTS (SELECT /*+ NO_JSON_TABLE_TRANSFORM */ 1 FROM ${rows(':2')} WHERE ${writeHasId('on', 'x')})`
            );
            expect(occurrences(trim, ':2')).toBe(1);
            expect(trim).toMatch(/^SELECT \/\*\+ NO_JSON_TABLE_TRANSFORM \*\/ /);
            expect(trim).not.toContain('PASSING');
        }
        // The stamps of the related days, read before and after, each id a row found through the index.
        const reads = `n.nid IN (SELECT /*+ NO_JSON_TABLE_TRANSFORM */ f.nid + 0 FROM ${rows('$x_')}`;
        expect(occurrences(statement.text.replace(/\$x_\d+/g, '$x_'), reads)).toBe(2);
        expect(occurrences(statement.text, `SELECT ${HINT} NVL(JSON_ARRAYAGG(`)).toBe(2);
        expect(occurrences(statement.text, `CROSS JOIN drivine_node f WHERE ${writeHasId('on')}`)).toBe(2);
        expect(statement.text).not.toContain('PASSING t.v');
        // Each lookup hands its node back as `f.nid + 0`: Oracle eliminates a join of the node table to a view of it on a
        // bare nid, and the filter on the view with it (drivine-cypher-spec#160).
        for (const text of [statement.text, ...found]) {
            expect(text).not.toMatch(/SELECT (\/\*\+ [A-Z_ ]+ \*\/ )?f\.nid FROM/);
        }
    });
});
