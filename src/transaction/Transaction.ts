import Stack from 'ts-data.stack';
import { TransactionContextHolder } from '@/transaction/TransactonContextHolder';
import * as assert from 'assert';
import { CursorSpecification } from '@/cursor/CursorSpecification';
import { QuerySpecification } from '@/query/QuerySpecification';
import { DrivineError } from '@/DrivineError';
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

    constructor(options: TransactionOptions, readonly contextHolder: TransactionContextHolder) {
        this.id = shortId();
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
            throw DrivineError.withRootCause(e as Error, spec);
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

    async popContext(): Promise<void> {
        this.callStack.pop();
        if (this.callStack.isEmpty()) {
            this.logger.verbose(`Closing ${this.cursors.length} open cursors.`);
            await Promise.all(this.cursors.map(async (it) => it.close()));
            if (this.options.rollback) {
                this.logger.verbose(
                    `Transaction: ${this.description} successful, but is marked ROLLBACK. Rolling back.`
                );
                await Promise.all(this.connections.map(async (it) => it.rollbackTransaction()));
            } else {
                this.logger.verbose(`Committing transaction: ${this.description}.`);
                await Promise.all(this.connections.map(async (it) => it.commitTransaction()));
            }
            await this.releaseClient();
        }
    }

    async popContextWithError(e: Error): Promise<void> {
        if (this.callStack.isEmpty()) {
            throw e;
        }
        this.callStack.pop();
        if (this.callStack.isEmpty()) {
            this.logger.verbose(`Rolling back transaction: ${this.description} due to error: ${e.message}.`);
            await Promise.all(this.connections.map(async (it) => it.rollbackTransaction()));
            await this.releaseClient(e);
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

    private async releaseClient(error?: Error): Promise<void> {
        this.logger.verbose(`Releasing connection(s) for transaction: ${this.id}`);
        await Promise.all(this.connections.map(async (it) => it.release(error)));
        this.contextHolder.currentTransaction = undefined;
    }
}
