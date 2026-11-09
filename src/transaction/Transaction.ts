import Stack from 'ts-data.stack';
import { TransactionContextHolder } from '@/transaction/TransactonContextHolder';
import * as assert from 'assert';
import { CursorSpecification } from '@/cursor/CursorSpecification';
import { QuerySpecification } from '@/query/QuerySpecification';
import { DrivineError } from '@/DrivineError';
import { ReusedIdsError } from '@/connection/sqlite/ReusedIdsError';
import { Cursor } from '@/cursor/Cursor';
import { Connection } from '@/connection/Connection';
import { TransactionOptions } from '@/transaction/Transactional';
import { DrivineLogger } from '@/logger';
import ShortUniqueId from "short-unique-id";
import { Mutex } from "async-mutex";

const shortId = new ShortUniqueId({ length: 7 });

export class Transaction {
    readonly id: string;
    readonly callStack: Stack<string>;
    readonly connectionRegistry: Map<string, Connection>;
    readonly cursors: Cursor<any>[];

    private readonly logger = new DrivineLogger(Transaction.name);
    private readonly connectionMutex = new Mutex();
    private _options: TransactionOptions;
    /**
     * The connections that have committed, or that a rollback has been asked of, so {@link popContextWithError} neither
     * rolls back one that committed nor asks one that failed to roll back to try again.
     */
    private readonly ended = new Set<Connection>();
    /** Whether the connections have been released, so none is released twice. */
    private released = false;

    constructor(options: TransactionOptions, readonly contextHolder: TransactionContextHolder) {
        this.id = shortId.rnd();
        this.callStack = new Stack<string>();
        this.connectionRegistry = new Map<string, Connection>();
        this.cursors = [];
        this.options = options;
        this.contextHolder.currentTransaction = this;
    }

    get description(): string {
        return `${this.id} [${this.databases}]`;
    }

    get databases(): string[] {
        return Array.from(this.connectionRegistry.keys());
    }

    get connections(): Connection[] {
        return Array.from(this.connectionRegistry.values());
    }

    async query<T>(spec: QuerySpecification<T>, database: string): Promise<T[]> {
        assert(this.callStack.count(), `pushContext() must be called running a query`);
        try {
            const connection = await this.connectionFor(database);
            const results = await connection.query(spec);
            return results;
        } catch (e) {
            // A SQLite graph whose ids could be reused is refused as itself, as outside a transaction.
            throw e instanceof ReusedIdsError ? e : DrivineError.withRootCause(e as Error, spec);
        }
    }

    async openCursor<T>(spec: CursorSpecification<T>, database: string): Promise<Cursor<T>> {
        assert(this.callStack.count(), `pushContext() must be called running a query`);
        const connection = await this.connectionFor(database);
        const cursor = await connection.openCursor(spec);
        this.cursors.push(cursor);
        return cursor;
    }

    async pushContext(context: string | symbol): Promise<void> {
        if (this.callStack.isEmpty()) {
            this.logger.verbose(`Starting transaction: ${this.id}`);
        }
        this.callStack.push(String(context));
        return Promise.resolve();
    }

    async popContext(isRoot: boolean): Promise<void> {
        this.callStack.pop();
        if (isRoot) {
            this.logger.verbose(`Closing ${this.cursors.length} open cursors.`);
            await Promise.all(this.cursors.map(async (it) => it.close()));
            if (this.options.rollback) {
                this.logger.verbose(
                    `Transaction: ${this.description} successful, but is marked ROLLBACK. Rolling back.`
                );
                // Each is ended once asked to roll back, so the rollback after one that fails doesn't ask it again.
                await this.endEach(async (it) => it.rollbackTransaction().finally(() => this.ended.add(it)));
            } else {
                this.logger.verbose(`Committing transaction: ${this.description}.`);
                await this.endEach(async (it) => it.commitTransaction());
            }
            await this.releaseClient();
        }
    }

    /**
     * Rolls back each connection that has not committed or rolled back yet, and then releases them all. A failure to
     * roll one back is logged, not thrown: `e`, the error that ended the transaction, is the one its caller throws, and
     * the other connections are still rolled back and every one released (liberation-data/drivine#561). One that has
     * committed, as where a transaction over two databases commits the first and the second refuses its commit, is not
     * rolled back: it can't be, and a graph engine refuses it.
     */
    async popContextWithError(e: Error, isRoot: boolean): Promise<void> {
        // A commit that failed in popContext has popped the root's context already: it is rolled back here.
        if (!this.callStack.isEmpty()) {
            this.callStack.pop();
        }
        if (isRoot) {
            this.logger.verbose(`Rolling back transaction: ${this.description} due to error: ${e.message}.`);
            try {
                await Promise.all(
                    this.connections
                        .filter((it) => !this.ended.has(it))
                        .map(async (it) => {
                            try {
                                await it.rollbackTransaction();
                                this.ended.add(it);
                            } catch (failure) {
                                const why = (failure as Error)?.message ?? String(failure);
                                this.logger.warn(
                                    `Could not roll back a connection of transaction ${this.description}: ${why}`
                                );
                            }
                        })
                );
            } finally {
                await this.releaseClient(e);
            }
        }
    }

    markAsRollback(): void {
        this._options = { ...this._options, rollback: true };
    }

    get options(): TransactionOptions {
        return this._options;
    }

    set options(options: TransactionOptions) {
        assert(this.callStack.isEmpty(), `Can't set options if the transaction is already in flight`);
        this._options = options;
    }

    private async connectionFor(database: string): Promise<Connection> {
        const release = await this.connectionMutex.acquire();

        try {
            if (!this.connectionRegistry.get(database)) {
                const databaseRegistry = this.contextHolder.databaseRegistry;
                const connectionProvider = databaseRegistry.connectionProvider(database);
                if (!connectionProvider) {
                    throw new DrivineError(`There is no database registered with key: ${database}`);
                }
                const connection = await connectionProvider.connect();
                this.connectionRegistry.set(database, connection);
                await connection.startTransaction();
            }
            return this.connectionRegistry.get(database)!;
        } finally {
            release();
        }
    }

    /**
     * Ends each connection with `end`, a commit or a rollback, all at once, and once every one has settled throws the
     * first failure, if any. Each that ends is kept in {@link ended}, so a rollback after a failure leaves it be.
     */
    private async endEach(end: (connection: Connection) => Promise<void>): Promise<void> {
        const settled = await Promise.allSettled(
            this.connections.map(async (it) => {
                await end(it);
                this.ended.add(it);
            })
        );
        const failed = settled.find((it): it is PromiseRejectedResult => it.status === 'rejected');
        if (failed) {
            throw failed.reason;
        }
    }

    /**
     * Releases each connection once, whatever another's release does, and ends the transaction in its context. A
     * failure to release one is logged.
     */
    private async releaseClient(error?: Error): Promise<void> {
        if (this.released) {
            return;
        }
        this.released = true;
        this.logger.verbose(`Releasing connection(s) for transaction: ${this.id}`);
        try {
            const settled = await Promise.allSettled(this.connections.map(async (it) => it.release(error)));
            for (const it of settled) {
                if (it.status === 'rejected') {
                    const why = (it.reason as Error)?.message ?? String(it.reason);
                    this.logger.warn(`Could not release a connection of transaction ${this.description}: ${why}`);
                }
            }
        } finally {
            this.contextHolder.currentTransaction = undefined;
        }
    }
}
