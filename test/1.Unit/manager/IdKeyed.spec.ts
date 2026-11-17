import {
    GraphBackend,
    ModelRegistry,
    NodeFragment,
    NodeId,
    nodeRef,
    PersistenceManager,
    PostgresBackend,
    PostgresGraph,
    QuerySpecification,
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

    it('is bound by a load and a delete as the text the store holds it as', async () => {
        await gom.load(Gauge, 1e-7);
        await gom.delete(Gauge, 1e-7);
        expect(bound.map((it) => it.id)).toEqual([key, key]);
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
