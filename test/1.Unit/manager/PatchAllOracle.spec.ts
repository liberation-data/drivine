import {
    ModelRegistry,
    NodeFragment,
    NodeId,
    OracleBackend,
    OracleGraph,
    PersistenceManager,
    QuerySpecification,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';

@NodeFragment({ labels: ['Reading'] })
class Reading {
    @NodeId() id: number;
    value?: number;
}

/**
 * A patchAll on Oracle finds each object's result by its row's position, not by the id the block gives back: that is
 * Oracle's plain JSON text of the binary double the node holds, which need not read back as the number given.
 */
describe('patchAll on Oracle', () => {
    it("hands each object its row's result, whatever text the block gives its id back as", async () => {
        const ids = [0.1 + 0.2, 1e-7, 123456.789, 4.5];
        const pm = {
            database: 'patch-all-oracle',
            // The block's rows in the order of the rows bound, each id as a text of fewer digits might read back.
            query: async (spec: QuerySpecification<any>) => {
                const rows = (spec.parameters as unknown as Record<string, string>).rows;
                const results = (JSON.parse(rows) as any[]).map((row, i) => ({
                    id: Number(Number(row.id?.$numberDouble ?? row.id).toPrecision(6)),
                    found: i % 2 === 0,
                    changed: i % 2 === 0
                }));
                return Promise.resolve(spec.postProcessors.reduce((it, processor) => processor.apply(it), results));
            }
        } as unknown as PersistenceManager;
        const gom = new StatelessGraphObjectManager(pm, new OracleBackend(new OracleGraph()), new ModelRegistry());
        const readings = ids.map((id) => Object.assign(new Reading(), { id, value: 1 }));
        const results = await gom.patchAll(readings, { only: ['value'] });
        // The rows are bound in the order of their ids' texts: 0.30000000000000004, 123456.789, 1e-7, 4.5.
        const bound = [...ids].sort((a, b) => (String(a) < String(b) ? -1 : 1));
        expect(results).toEqual(
            ids.map((id) => {
                const found = bound.indexOf(id) % 2 === 0;
                return { found, applied: found, changed: found };
            })
        );
    });
});
