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

// The query DSL refuses a date on Oracle by name, until its filters come from the module's fragments
// (drivine-cypher-spec#235, step 4): it compared a property's text with the date's ISO text, where layout 2 holds the tag
// (#771). SQLite's and Postgres's come from the fragments: see below.
describe('A date in a query DSL value on Oracle', () => {
    const backend: GraphBackend = new OracleBackend();
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

/** The JSON a fragment binds a date as: the tag layout 2 holds it as (drivine-cypher-spec#161). */
const TAGGED = JSON.stringify({ $t: 'datetime', v: '2026-01-01T00:00:00Z', s: '10000020260101000000000000000064800' });

// On SQLite and Postgres the query DSL's filters, seeks and orders are the shared module's fragments
// (drivine-cypher-spec#235, steps 2 and 3), which compare a date by its tag, so a date is no longer refused (#771).
describe.each([
    ['SQLite', new SqliteBackend()],
    ['Postgres', new PostgresBackend()]
] as [string, GraphBackend][])('A date in a query DSL value on %s', (_, backend) => {
    it("is compared by its tag in eq, gt, in, notIn and hasItem, bound by the renderer's names", () => {
        for (const fn of [
            (q: any) => q.at.eq(first),
            (q: any) => q.at.gt(first),
            (q: any) => q.at.notIn([first]),
            (q: any) => q.days.hasItem(first),
            (q: any) => q.property('at').eq(first)
        ]) {
            const { where, bindings }: { where: string; bindings: Record<string, any> } = backend.renderWhere(
                fn,
                dated
            );
            expect(where).toContain('n_.props');
            expect(where).toContain('$_cy__q0');
            expect(Object.keys(bindings)).toEqual(['_cy__q0']);
            expect(bindings._cy__q0).toContain(TAGGED);
        }
        expect(backend.renderWhere((q: any) => q.at.in([first]), dated).bindings).toEqual({
            _cy__q0: `[${TAGGED}]`
        });
    });

    it('is compared by its tag in a seek, and in an order expression, its parameters named apart there', () => {
        const seek = backend.renderQuery((q: any) => ({ orderBy: q.at.asc(), seek: q.at.after(first) }), dated);
        expect(seek.bindings).toEqual({ _cy__q0: TAGGED });
        const order = backend.renderQuery(
            (q: any) => ({ orderBy: caseOf([above(q.at, first).then(1)], 2).asc() }),
            dated
        );
        expect(order.where).toBeUndefined();
        expect(order.orderBy).toContain('$_cy_f1__q0');
        expect(order.bindings).toEqual({ _cy_f1__q0: TAGGED, _cy_f1__q1: '1', _cy_f1__q2: '2' });
    });

    it("is compared by its tag in a grouped read's where and in a filtered aggregate", async () => {
        const statements: any[] = [];
        const groups = new GroupOperations(
            registry,
            async (statement) => {
                statements.push(statement);
                return Promise.resolve([]);
            },
            undefined as any,
            backend
        );
        await groups.load(Dated, (q: any) => ({
            where: q.at.gte(first),
            keys: { name: key(q.name) },
            aggregates: { since: count(q.at.gt(first)) }
        }));
        const [statement] = statements;
        // The aggregates' filters are written before the where, each numbered on from the one before.
        expect(statement.bindings).toEqual({ _cy__q0: TAGGED, _cy__q1: TAGGED });
        expect(statement.text).toContain('$_cy__q0');
        expect(statement.text).toContain('$_cy__q1');
    });

    it("binds a JSON-packed property's value, date or not, as the text it is packed as", () => {
        const bound = (fn: (q: any) => any): unknown[] => Object.values(backend.renderWhere(fn, dated).bindings);
        expect(bound((q) => q.packed.eq(first))).toEqual([JSON.stringify(JSON.stringify(first))]);
        expect(bound((q) => q.packed.eq({ n: 1 }))).toEqual([JSON.stringify('{"n":1}')]);
        expect(bound((q) => q.name.eq('two'))).toEqual(['"two"']);
        expect(bound((q) => q.at.isNotNull())).toEqual([]);
    });
});
