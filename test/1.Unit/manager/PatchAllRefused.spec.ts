import {
    GraphBackend,
    ModelRegistry,
    NodeFragment,
    NodeId,
    OracleBackend,
    OracleGraph,
    PATCH_ROWS,
    PersistenceManager,
    PostgresBackend,
    PostgresGraph,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';
import { NON_FINITE_SAVED } from '@/cypher/ValueLayout';

@NodeFragment({ labels: ['Reading'] })
class Reading {
    @NodeId() id: string;
    value?: number;
}

/**
 * A patchAll of more rows than one statement takes, refused on a SQL store for a NaN in a later statement's rows: it
 * is refused before the first statement runs, so it writes nothing (drivine-cypher-spec#329).
 */
describe('patchAll refused', () => {
    it.each([
        ['Oracle', (): GraphBackend => new OracleBackend(new OracleGraph())],
        ['Postgres', (): GraphBackend => new PostgresBackend(new PostgresGraph())]
    ])('on %s, refuses a NaN in a later statement before the first runs', async (_, backend) => {
        const ran: unknown[] = [];
        const pm = {
            database: 'patch-all-refused',
            query: async (spec: unknown) => {
                ran.push(spec);
                return Promise.resolve([]);
            }
        } as unknown as PersistenceManager;
        const gom = new StatelessGraphObjectManager(pm, backend(), new ModelRegistry());
        const readings = Array.from({ length: PATCH_ROWS + 1 }, (_, i) =>
            Object.assign(new Reading(), { id: `r${String(i).padStart(5, '0')}`, value: i === PATCH_ROWS ? NaN : i })
        );
        await expect(gom.patchAll(readings, { only: ['value'] })).rejects.toThrow(NON_FINITE_SAVED);
        expect(ran).toEqual([]);
    });
});
