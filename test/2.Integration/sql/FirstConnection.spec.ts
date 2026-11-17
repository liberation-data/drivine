import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';
import { DatabaseType, PersistenceManager, QuerySpecification } from '@liberation-data/drivine';
import { SqlStore, sqlPersistenceManager, sqlStores } from '../support/SqlStores';

jest.setTimeout(60_000);

/**
 * The spec's marker.yaml (test/cypher) `storeLayout.firstConnection` cases, on each SQL store: a graph set up as each
 * says is refused by its first connection, with the message the case gives, before anything is made in it. The verdict
 * is asked before the store's ensuring makes this layout's lock table, which would read as the evidence that a graph
 * without a stamp is of this layout (liberation-data/drivine-cypher-spec#161).
 */
interface FirstConnectionCase {
    name: string;
    store: 'postgres' | 'oracle' | 'sqlite';
    setup: string[];
    refused: boolean;
    refuse: string;
    absent: string[];
}

const CASES: FirstConnectionCase[] = parse(fs.readFileSync(path.join(__dirname, '../../cypher/marker.yaml'), 'utf8'))
    .storeLayout.firstConnection;

/** A statement that reads nothing of the graph, run on its manager to open its first connection. */
function nothing(store: SqlStore): string {
    return store.type === DatabaseType.ORACLE ? 'SELECT 1 AS "one" FROM dual' : 'SELECT 1 AS "one"';
}

/** How many tables of `name` the store holds, by the catalog, which reads the same whatever the case of its name. */
function tables(store: SqlStore, name: string): string {
    switch (store.type) {
        case DatabaseType.ORACLE:
            return `SELECT COUNT(*) AS "n" FROM user_tables WHERE table_name = UPPER('${name}')`;
        case DatabaseType.SQLITE:
            return `SELECT count(*) AS "n" FROM sqlite_master WHERE type = 'table' AND lower(name) = lower('${name}')`;
        default:
            return `SELECT count(*) AS "n" FROM pg_catalog.pg_tables WHERE tablename = lower('${name}')`;
    }
}

/** What drops the table `name`, where it is there. */
function drop(store: SqlStore, name: string): string {
    return store.type === DatabaseType.ORACLE ? `DROP TABLE IF EXISTS ${name} PURGE` : `DROP TABLE IF EXISTS ${name}`;
}

describe.each(sqlStores().map((it) => [it.name, it] as const))(
    "marker.yaml's first connection cases on %s",
    (_, store) => {
        const cases = CASES.filter((it) => it.store.toUpperCase() === store.name);
        let pm: PersistenceManager;

        beforeAll(() => {
            pm = sqlPersistenceManager(store);
        });

        it('has a case for the store', () => {
            expect(cases.length).toBeGreaterThan(0);
        });

        it.each(cases.map((it, i) => [it.name, it, i] as const))('%s', async (__, it, i) => {
            const graph = `first_conn_${i}_${Date.now() % 100_000}`;
            const named = (text: string): string => text.split('{graph}').join(graph);
            try {
                for (const statement of it.setup) {
                    await pm.execute(new QuerySpecification(named(statement)));
                }
                const refused = sqlPersistenceManager(store, graph);
                expect(it.refused).toBe(true);
                // Refused on every connection, not only the first: no statement may run over the graph.
                for (let attempt = 0; attempt < 2; attempt++) {
                    await expect(refused.query(new QuerySpecification(nothing(store)))).rejects.toThrow(
                        named(it.refuse)
                    );
                }
                for (const absent of it.absent) {
                    const [count] = await pm.query<any>(new QuerySpecification(tables(store, named(absent))));
                    expect(Number(typeof count === 'object' ? Object.values(count)[0] : count)).toEqual(0);
                }
            } finally {
                for (const table of ['_lock2', '_node']) {
                    await pm.execute(new QuerySpecification(drop(store, `${graph}${table}`)));
                }
            }
        });
    }
);
