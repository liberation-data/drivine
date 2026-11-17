import {
    above,
    caseOf,
    count,
    GraphBackend,
    JsonPacked,
    key,
    ModelRegistry,
    NodeFragment,
    NodeId,
    OracleBackend,
    PostgresBackend,
    SqliteBackend,
    TargetModel
} from '@liberation-data/drivine';
import { TEMPORAL_FILTER_REFUSED } from '@/backend/sql/SqlQueryRenderer';
import { GroupOperations } from '@/manager/GroupOperations';

@NodeFragment({ labels: ['Dated'] })
class Dated {
    @NodeId() id: string;
    name?: string;
    at?: Date;
    days?: Date[];
    @JsonPacked() packed?: any;
}

const registry = new ModelRegistry();
const dated: TargetModel = { kind: 'NODE_FRAGMENT', model: registry.fragment(Dated) };
const first = new Date('2026-01-01T00:00:00.000Z');

// The query DSL refuses a date on a SQL store by name, until its filters come from the module's fragments
// (drivine-cypher-spec#235): it compared a property's text with the date's ISO text, where layout 2 holds the tag (#771).
describe.each([
    ['SQLite', new SqliteBackend()],
    ['Postgres', new PostgresBackend()],
    ['Oracle', new OracleBackend()]
] as [string, GraphBackend][])('A date in a query DSL value on %s', (_, backend) => {
    const where = (fn: (q: any) => any) => () => backend.renderWhere(fn, dated);
    const query = (fn: (q: any) => any) => () => backend.renderQuery(fn, dated);

    it('is refused by name in eq, gt, in, notIn and hasItem, and inside a list given to in', () => {
        for (const fn of [
            (q: any) => q.at.eq(first),
            (q: any) => q.at.gt(first),
            (q: any) => q.at.in([first]),
            (q: any) => q.at.in(['2026-01-01T00:00:00.000Z', first]),
            (q: any) => q.at.notIn([first]),
            (q: any) => q.days.hasItem(first),
            (q: any) => q.property('at').eq(first)
        ]) {
            expect(where(fn)).toThrow(TEMPORAL_FILTER_REFUSED);
        }
    });

    it('is refused by name in a seek and in an order expression', () => {
        expect(query((q) => ({ orderBy: q.at.asc(), seek: q.at.after(first) }))).toThrow(TEMPORAL_FILTER_REFUSED);
        expect(query((q) => ({ orderBy: caseOf([above(q.at, first).then(1)], 2).asc() }))).toThrow(
            TEMPORAL_FILTER_REFUSED
        );
    });

    it("is refused by name in a grouped read's where and in a filtered aggregate", async () => {
        const groups = new GroupOperations(registry, async () => Promise.resolve([]), undefined as any, backend);
        await expect(
            groups.load(Dated, (q: any) => ({ where: q.at.gte(first), keys: { name: key(q.name) } }))
        ).rejects.toThrow(TEMPORAL_FILTER_REFUSED);
        await expect(
            groups.load(Dated, (q: any) => ({
                keys: { name: key(q.name) },
                aggregates: { since: count(q.at.gt(first)) }
            }))
        ).rejects.toThrow(TEMPORAL_FILTER_REFUSED);
    });

    it("leaves a JSON-packed property's value, date or not, and any other value, as it was", () => {
        const bound = (fn: (q: any) => any): unknown[] => Object.values(backend.renderWhere(fn, dated).bindings);
        expect(bound((q) => q.packed.eq(first))).toContainEqual(JSON.stringify(first));
        expect(bound((q) => q.packed.eq({ n: 1 }))).toContainEqual('{"n":1}');
        expect(bound((q) => q.name.eq('two'))).toContainEqual('two');
        expect(bound((q) => q.at.isNotNull())).toEqual([]);
    });
});
