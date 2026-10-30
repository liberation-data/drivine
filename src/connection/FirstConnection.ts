import { DrivineLogger } from '@/logger/DrivineLogger';
import { ddlWillNotMake } from '@/manager/Contention';

/**
 * What a SQL store's connection provider runs on its first connection: the graph's `ensuring` block, which makes the
 * graph's tables when they are not there, so whatever is sent first, Cypher, SQL or an object manager's statement,
 * finds them (liberation-data/drivine#343). It runs once per provider, so once per pool and graph, not per statement:
 * the connections asked for meanwhile wait for it, and one that fails is run again by the next connection. The block is
 * the one the object manager runs, and does nothing over a store already there, so a user who may only read a graph
 * already made can connect, and which of the two comes first doesn't matter. A block turned away by a deadlock with another
 * session is run again by `ensure` itself (liberation-data/drivine#454): the connections waiting wait through it, and
 * only a failure it gives up on is one here.
 *
 * A block the store refuses for good, as a user who may not make tables or a database that may only be read does
 * (see {@link ddlWillNotMake}), is warned of once and not run again by this provider: each connection is handed out, so
 * plain SQL works, and a statement over tables that are not there says so (liberation-data/drivine#468, as
 * liberation-data/drivine4j#453 and liberation-data/drivine-python#290). Run again, it would fail every connection. A
 * new provider over the store runs it again, so a grant given later, or a standby made primary, is found when the
 * application restarts.
 */
export class FirstConnection {
    private readonly logger = new DrivineLogger(FirstConnection.name);
    private made?: Promise<void>;

    /** @param store names the graph and the store, as `graph 'drivine' on POSTGRES database 'PG'`, for the warning. */
    constructor(private readonly store: () => string) {}

    /**
     * The connection, once `ensure` has run on the provider's first. A connection whose wait failed is closed and the
     * failure thrown.
     *
     * @param ensure runs the graph's `ensuring` block on the connection, outside a transaction: schema statements
     * commit on their own on Oracle, and Postgres runs the block whole or not at all.
     * @param close hands the connection back when the block failed.
     */
    async ensured<C>(
        connection: C,
        ensure: (connection: C) => Promise<unknown>,
        close: (connection: C, failure: Error) => Promise<unknown> | void
    ): Promise<C> {
        this.made ??= ensure(connection).then(
            () => undefined,
            (e) => {
                if (ddlWillNotMake(e)) {
                    this.logger.warn(
                        `Could not make the tables of ${this.store()}: the user may not make them, or the database ` +
                            `may only be read. Statements over them fail if they are not there. The provider does ` +
                            `not try again. (${e})`
                    );
                    return;
                }
                this.made = undefined;
                throw e;
            }
        );
        try {
            await this.made;
        } catch (e) {
            await close(connection, e as Error);
            throw e;
        }
        return connection;
    }
}
