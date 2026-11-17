import {
    GraphBackend,
    ModelRegistry,
    NodeFragment,
    NodeId,
    PATCH_ROWS,
    PersistenceManager,
    PostgresBackend,
    PostgresGraph,
    SqliteBackend,
    SqliteGraph,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';

@NodeFragment({ labels: ['Reading'] })
class Reading {
    @NodeId() id: string;
    value?: number;
}

/**
 * A patchAll of more rows than one statement takes, refused on a SQL store whose JSON holds NaN as no number, Postgres's
 * and SQLite's, for a NaN in a later statement's rows: it is refused before the first statement runs, so it writes
 * nothing, with the module's message (drivine-cypher-spec#329). Oracle holds NaN, as a binary double.
 */
describe('patchAll refused', () => {
    it.each([
        [
            'Postgres',
            (): GraphBackend => new PostgresBackend(new PostgresGraph()),
            "A statement that writes is given NaN or an infinity, which Postgres's `jsonb` holds as no number: it would store another value in its place."
        ],
        [
            'SQLite',
            (): GraphBackend => new SqliteBackend(new SqliteGraph()),
            "A statement that writes is given NaN, which SQLite's JSON holds as no number: it would store another value in its place."
        ]
    ])('on %s, refuses a NaN in a later statement before the first runs', async (_, backend, refusal) => {
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
        await expect(gom.patchAll(readings, { only: ['value'] })).rejects.toThrow(refusal);
        expect(ran).toEqual([]);
    });
});
