import { storeStatements } from '@/backend/StoreStatements';

/** What a read of the catalog needs of a connection: node-oracledb's `execute`, rows as objects. */
export interface ExecutesQuery {
    execute(sql: string): Promise<{ rows?: unknown[] }>;
}

/** Oracle's error for a table or view that isn't there: a store made before the graph kept its schema's records. */
const NO_TABLE = 942;

/**
 * The labelled indexes of an Oracle graph, each its label and leading property, which a Cypher statement is compiled
 * with (the compiler's `indexedProperties`), so a key equality is written as the index's expression and a keyed `MATCH`
 * reads its node through the index, not every node of the label (#753, drivine4j#805). Read with the module's own query
 * (`storeStatements`' `labelled`, drivine-cypher-spec#432), as drivine4j and drivine-python read them.
 *
 * Remembered for the database, its user and the graph, for {@link FRESH_FOR_MS}, or until an index or constraint of the
 * graph is made or dropped in this process ({@link changed}): one made by another process is seen when that lapses. A
 * statement compiled without an index gives the same rows, only read more slowly.
 */
export class OracleIndexedProperties {
    /** How long the indexes read are taken as the graph's before they are read again. */
    static readonly FRESH_FOR_MS = 60_000;

    /** The indexes of each database, user and graph, and when ({@link clock}) they were read. */
    private static readonly read = new Map<string, { at: number; indexed: Promise<Array<[string, string]>> }>();

    /** Milliseconds, as `performance.now()` counts them: replaced by a test that lets {@link FRESH_FOR_MS} pass. */
    static clock: () => number = () => performance.now();

    /**
     * The label and leading property of each labelled index, and each one-property uniqueness constraint, of `graph`,
     * as the catalog lists them. A query that fails rolls back only itself, so a transaction open on `connection` is
     * left as it was.
     *
     * @param database the database and the user the session is of, which with the graph keys what is remembered
     * @throws where the read fails for any reason but the graph's schema table not being there
     */
    static async of(connection: ExecutesQuery, database: string, graph: string): Promise<Array<[string, string]>> {
        const key = `${database}|${graph}`;
        const now = this.clock();
        const held = this.read.get(key);
        if (held && now - held.at < this.FRESH_FOR_MS) {
            return held.indexed;
        }
        const forget = (): void => {
            if (this.read.get(key)?.indexed === indexed) {
                this.read.delete(key);
            }
        };
        // A failed read, and one of a graph whose schema table isn't made yet, isn't kept: the next statement reads again.
        const indexed = listed(connection, graph).then(
            (it) => {
                if (!it) {
                    forget();
                }
                return it ?? [];
            },
            (e) => {
                forget();
                throw e;
            }
        );
        this.read.set(key, { at: now, indexed });
        return indexed;
    }

    /** Reads the indexes of `graph` again, for every session: one of its indexes or constraints was made or dropped. */
    static changed(graph: string): void {
        for (const key of [...this.read.keys()]) {
            if (key.endsWith(`|${graph}`)) {
                this.read.delete(key);
            }
        }
    }
}

/** The indexes the catalog lists, or null where the graph's schema table isn't there. */
async function listed(connection: ExecutesQuery, graph: string): Promise<Array<[string, string]> | null> {
    let rows: unknown[];
    try {
        rows = (await connection.execute(storeStatements('oracle', graph).labelled!)).rows ?? [];
    } catch (e) {
        if ((e as { errorNum?: number }).errorNum === NO_TABLE) {
            return null;
        }
        throw e;
    }
    return rows.flatMap((row) => {
        const value = Object.values(row as Record<string, unknown>)[0];
        const item = (typeof value === 'string' ? JSON.parse(value) : value) as {
            label?: string;
            properties?: string[];
        };
        return item?.label && item.properties?.length ? [[item.label, item.properties[0]] as [string, string]] : [];
    });
}
