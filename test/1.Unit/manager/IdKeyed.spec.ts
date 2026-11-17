import {
    CascadeType,
    Direction,
    GraphBackend,
    GraphRelationship,
    GraphView,
    ModelRegistry,
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
 * A load, a delete and a relate by a float id, on Postgres and SQLite, bind the id as the text the store reads the node's
 * id back as (storedKey): JavaScript's text of 1e-7 is `1e-7`, which no node holds.
 */
describe.each([
    ['Postgres', (): GraphBackend => new PostgresBackend(new PostgresGraph()), '0.00000010'],
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

    it('is bound by a load, a delete and a cascade as the text the store holds it as', async () => {
        await gom.load(Gauge, 1e-7);
        await gom.load(GaugeTree, 1e-7);
        await gom.delete(Gauge, 1e-7);
        await gom.delete(GaugeTree, 1e-7, { cascade: CascadeType.DELETE_ALL });
        expect(bound.map((it) => it.id)).toEqual(Array(5).fill(key));
    });

    it("is bound by a save's reads of the node's properties and stamp as the text the store holds it as", () => {
        const model = new ModelRegistry().fragment(Gauge);
        const held = backend().heldProperties(model).spec({ id: 1e-7 });
        const found = backend().foundStamp(model).spec({ id: 1e-7 });
        expect([(held.parameters as any).id, (found.parameters as any).id]).toEqual([key, key]);
    });

    it('is bound by loadRelated as the text the store holds it as', async () => {
        await gom.edges.loadRelated(nodeRef(Gauge, 1e-7), 'POINTS', undefined, Gauge);
        expect(bound.map((it) => it.x_from)).toEqual([key]);
    });

    it('leaves a text id and a null id as they are', async () => {
        await gom.load(Gauge, '1e-7');
        await gom.load(Gauge, null);
        expect(bound.map((it) => it.id)).toEqual(['1e-7', null]);
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
        expect(bound.every((it) => /PASSING JSON\(\S+ EXTENDED\) AS "id__"/.test(it.text))).toBe(true);
    });

    it("binds a save's reads of the node's properties and stamp as the JSON Oracle holds the id as", () => {
        const backend = new OracleBackend(new OracleGraph());
        const model = new ModelRegistry().fragment(Gauge);
        for (const statement of [backend.heldProperties(model), backend.foundStamp(model)]) {
            expect(statement.text).toMatch(/PASSING JSON\(\S+ EXTENDED\) AS "id__"/);
            expect((statement.spec({ id: 1e-7 }).parameters as any).id).toEqual('{"$numberDouble":"1.0E-7"}');
        }
    });

    it("binds loadRelated's, unrelateAll's and relate's ends as the JSON Oracle holds the id as, read EXTENDED", () => {
        const backend = new OracleBackend(new OracleGraph());
        const model = new ModelRegistry().fragment(Gauge);
        const from = { model, id: 1e-7 };
        const held = '{"$numberDouble":"1.0E-7"}';
        const related = backend.related(from, 'POINTS', Direction.OUTGOING, model);
        expect(related.text).toMatch(/PASSING JSON\(\$x_from EXTENDED\) AS "v"/);
        expect((related.spec().parameters as any).x_from).toEqual(held);
        expect((backend.unrelateAll(from, 'POINTS', Direction.OUTGOING).spec().parameters as any).x_from).toEqual(held);
        const relate = backend.relate(from, { model, id: 4.5 }, 'POINTS', {}, RelateMode.MERGE).spec()
            .parameters as any;
        expect([relate.x_from, relate.x_to]).toEqual([held, '{"$numberDouble":"4.5"}']);
        expect(relate.x_frommatch).toMatch(/PASSING JSON\(:1 EXTENDED\) AS "v"/);
    });

    it("binds loadRelated's, unrelateAll's and relate's null ends as they are, so they find no node (#772)", () => {
        const backend = new OracleBackend(new OracleGraph());
        const model = new ModelRegistry().fragment(Gauge);
        const from = { model, id: null };
        expect((backend.related(from, 'POINTS', Direction.OUTGOING, model).spec().parameters as any).x_from).toBeNull();
        expect((backend.unrelateAll(from, 'POINTS', Direction.OUTGOING).spec().parameters as any).x_from).toBeNull();
        const relate = backend.relate(from, { model, id: null }, 'POINTS', {}, RelateMode.MERGE).spec()
            .parameters as any;
        expect([relate.x_from, relate.x_to]).toEqual([null, null]);
    });

    it('binds a text id as its JSON, and a null id as it is', async () => {
        await gom.load(Gauge, '1e-7');
        await gom.load(Gauge, 7);
        await gom.load(Gauge, null);
        expect(bound.map((it) => it.id)).toEqual(['"1e-7"', '7', null]);
    });

    // A null id written as the JSON text 'null' was read by the block's find_node as JSON's null, so a patch could reach a
    // node whose id is held as null, where a load or a delete by a null id finds none (#772).
    it("binds a patch's null id as it is, so it finds no node, and a float id as the JSON Oracle holds it as", async () => {
        await gom.patch(Gauge, null as any, { set: { name: 'x' } }).catch(() => undefined);
        await gom.patch(Gauge, 1e-7, { set: { name: 'x' } }).catch(() => undefined);
        expect(bound.map((it) => it.id)).toEqual([null, '{"$numberDouble":"1.0E-7"}']);
    });
});
