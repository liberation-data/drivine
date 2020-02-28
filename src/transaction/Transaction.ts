import Stack from 'ts-data.stack';
import { TransactionContextHolder } from '@/transaction/TransactonContextHolder';
import { Logger } from '@nestjs/common';
import * as assert from 'assert';
import { CursorSpecification } from '@/cursor/CursorSpecification';
import { QuerySpecification } from '@/query/QuerySpecification';
import { DrivineError } from '@/DrivineError';
import { Cursor } from '@/cursor/Cursor';
import { Connection } from '@/connection/Connection';
import shortId = require('shortid');

export class Transaction {
    readonly id: string;
    readonly callStack: Stack<string>;
    readonly connectionRegistry: Map<string, Connection>;
    readonly cursors: Cursor<any>[];

    private readonly logger = new Logger(Transaction.name);

    constructor(private rollback: boolean, readonly contextHolder: TransactionContextHolder) {
        this.id = shortId.generate();
        this.callStack = new Stack<string>();
        this.connectionRegistry = new Map<string, Connection>();
        this.cursors = [];
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
            throw DrivineError.withRootCause(e, spec);
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
            await Promise.all(this.cursors.map(async it => it.close()));
            if (this.rollback) {
                this.logger.verbose(
                    `Transaction: ${this.description} successful, but is marked ROLLBACK. Rolling back.`
                );
                await Promise.all(this.connections.map(async it => it.rollbackTransaction()));
            } else {
                this.logger.verbose(`Committing transaction: ${this.description}.`);
                await Promise.all(this.connections.map(async it => it.commitTransaction()));
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
            await Promise.all(this.connections.map(async it => it.rollbackTransaction()));
            await this.releaseClient(e);
        }
    }

    /**
     * Manually signify that this transaction should be rolled back.
     */
    markAsRollback(): void {
        this.rollback = true;
    }

    private async connectionFor(database: string): Promise<Connection> {
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
    }

    private async releaseClient(error?: Error): Promise<void> {
        this.logger.verbose(`Releasing connection(s) for transaction: ${this.id}`);
        await Promise.all(this.connections.map(async it => it.release(error)));
        this.contextHolder.currentTransaction = undefined;
    }
}
