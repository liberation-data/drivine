/**
 * What a SQL store's connection provider runs on its first connection: the graph's `ensuring` block, which makes the
 * graph's tables when they are not there, so whatever is sent first, Cypher, SQL or an object manager's statement,
 * finds them (liberation-data/drivine#343). It runs once per provider, so once per pool and graph, not per statement:
 * the connections asked for meanwhile wait for it, and one that fails is run again by the next connection. The block is
 * the one the object manager runs, and does nothing over a store already there, so a user who may only read a graph
 * already made can connect, and which of the two comes first doesn't matter.
 */
export class FirstConnection {
    private made?: Promise<void>;

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
        this.made ??= ensure(connection)
            .then(() => undefined)
            .catch((e) => {
                this.made = undefined;
                throw e;
            });
        try {
            await this.made;
        } catch (e) {
            await close(connection, e as Error);
            throw e;
        }
        return connection;
    }
}
