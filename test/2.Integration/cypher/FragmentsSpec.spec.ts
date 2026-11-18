import { DatabaseRegistry, DatabaseType, PersistenceManager, QuerySpecification } from '@liberation-data/drivine';
import { fragment, FragmentPart, SharedGraph, SharedStore } from '@/cypher/SharedCypherCompiler';
import { FragmentsSpec, loadFragmentsSpec, parametersOf, partOf } from '../../cypher/FragmentsSpec';
import { sqlPersistenceManager, SqlStore, sqlStores } from '../support/SqlStores';

jest.setTimeout(300_000);

/** The graph the runner writes, tables of its own, so no other suite's nodes are among its rows. */
const GRAPH = 'cy_fragments';

const SHARED: Record<SqlStore['name'], SharedStore> = { POSTGRES: 'postgres', ORACLE: 'oracle', SQLITE: 'sqlite' };

/** The text of the plain text property `key` of the node `row`, as the store reads it. */
function text(store: SqlStore, row: string, key: string): string {
    if (store.type === DatabaseType.ORACLE) {
        return `JSON_VALUE(${row}.props, '$.${key}')`;
    }
    return store.type === DatabaseType.SQLITE ? `(${row}.props ->> '$.${key}')` : `(${row}.props ->> '${key}')`;
}

/**
 * The SQL stores configured in the environment, or those of them `CYPHER_SPEC_STORES` names: CI runs the Cypher spec and
 * this beside it over two jobs (test/run-tests.ts).
 */
function stores(): SqlStore[] {
    const named = process.env.CYPHER_SPEC_STORES?.split(',').map((it) => it.trim());
    return sqlStores().filter((it) => !named || named.includes(SHARED[it.name]));
}

/**
 * The spec's `fragments.yaml` run on each SQL store (liberation-data/drivine-cypher-spec#161), as drivine4j's
 * FragmentsCrossEngineTest runs it: each case's fragment, asked of the module as the object manager asks it, run in SQL of
 * the test's own over `setup`'s nodes, keeps or orders the nodes Neo4j does for the same expression. The terms each store
 * is given are held to the spec's pins by test/1.Unit/cypher/Fragments.spec.ts.
 */
describe.each(stores())('fragments.yaml on $name', (store) => {
    const spec = loadFragmentsSpec();
    const shared = SHARED[store.name];
    // On Oracle the graph's stored functions are there: the connection makes them with its tables.
    const graph: SharedGraph = { name: GRAPH, indexedProperties: spec.indexed };
    let pm: PersistenceManager;

    beforeAll(async () => {
        pm = sqlPersistenceManager(store, GRAPH);
        // The connection makes the graph's tables on its first statement; a node's edges go with it.
        await pm.execute(new QuerySpecification(`DELETE FROM ${GRAPH}_node`));
        for (const statement of spec.setup) {
            await pm.execute(new QuerySpecification({ text: statement, language: 'CYPHER' }));
        }
    });

    afterAll(async () => {
        await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
        DatabaseRegistry.tearDown();
    });

    it('each fragment keeps or orders the nodes Neo4j does', async () => {
        const row = (spec.variables.n as { node: string }).node;
        const labelled = fragment(shared, graph, { condition: 'n:Person' }, spec.variables);
        const id = text(store, row, 'id');
        let checked = 0;
        const wrong: string[] = [];

        // One fragment run as the library runs it, its hints in the outermost SELECT, the ids it keeps or orders checked.
        const check = async (
            label: string,
            expected: string[],
            part: FragmentPart,
            parameters: Record<string, any>
        ): Promise<void> => {
            checked++;
            let sql = '';
            let got: string[];
            try {
                const compiled = fragment(shared, graph, part, spec.variables, parameters);
                const hints = [...new Set([...labelled.hints, ...compiled.hints])];
                sql =
                    `SELECT ${hints.length > 0 ? `/*+ ${hints.join(' ')} */ ` : ''}${id} AS "id" ` +
                    `FROM ${GRAPH}_node ${row} WHERE ${labelled.terms[0]}`;
                sql +=
                    'condition' in part
                        ? ` AND (${compiled.terms[0]}) ORDER BY ${id}`
                        : ` ORDER BY ${[...compiled.terms, id].join(', ')}`;
                const rows = await pm.query<any>(
                    new QuerySpecification(sql).bind({ ...labelled.parameters, ...compiled.parameters })
                );
                got = rows.map((it) =>
                    String(it !== null && typeof it === 'object' ? it.id ?? Object.values(it)[0] : it)
                );
            } catch (e) {
                got = [`ERROR ${String((e as Error).message).substring(0, 300)}`];
            }
            if (JSON.stringify(got) !== JSON.stringify(expected)) {
                wrong.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}\n    ${sql}`);
            }
        };

        const withRows = spec.cases.filter((it) => it.rows !== undefined);
        for (const it of withRows) {
            await check(it.name, it.rows!, partOf(it), parametersOf(it.parameters));
        }
        // The table: each form in each position, each value as an order both ways.
        const { positions, conditions, orders }: FragmentsSpec['table'] = spec.table;
        for (const entry of conditions) {
            for (let at = 0; at < positions.length; at++) {
                const condition = positions[at].replace('{f}', entry.form);
                await check(condition, entry.rows[at], { condition }, parametersOf(entry.parameters));
            }
        }
        for (const entry of orders) {
            for (const [at, descending] of [false, true].entries()) {
                await check(
                    `ORDER BY ${entry.value}${descending ? ' DESC' : ''}`,
                    entry.rows[at],
                    { order: entry.value, descending },
                    {}
                );
            }
        }
        expect(`${wrong.length} of ${checked} differ from Neo4j:\n${wrong.join('\n')}`).toEqual(
            `0 of ${checked} differ from Neo4j:\n`
        );
        // fragments.yaml's cases with rows, and its table.
        expect([withRows.length, checked]).toEqual([25, 25 + conditions.length * positions.length + orders.length * 2]);
    });
});
