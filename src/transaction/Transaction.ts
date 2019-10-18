import Stack from 'ts-data.stack';
import {TransactionContextHolder} from '@/transaction/TransactonContextHolder';
import {TransactionContextKeys} from '@/transaction/TransactionContextKeys';
import {Logger} from '@nestjs/common';
import {Namespace} from 'cls-hooked';
import * as assert from 'assert';
import {CursorSpecification} from '@/cursor/CursorSpecification';
import {QuerySpecification} from '@/query/QuerySpecification';
import {DrivineError} from '@/DrivineError';
import {Connection} from '@/connection/Connection';
import {ConnectionProvider} from '@/connection/ConnectionProvider';
import {Cursor} from "@/cursor/Cursor";
import shortId = require('shortid');

export class Transaction {
    public readonly connectionProvider: ConnectionProvider;
    public readonly id: string;
    public readonly callStack: Stack<string>;
    private localStorage: Namespace;

    private rollback: boolean;
    private _connection: Connection;
    private _cursors: Cursor<any>[];

    private readonly logger = new Logger(Transaction.name);

    public constructor(connectionProvider: ConnectionProvider, rollback: boolean, localStorage: Namespace) {
        this.connectionProvider = connectionProvider;
        this.rollback = rollback;
        this.id = shortId.generate();
        this.callStack = new Stack<string>();
        this.localStorage = localStorage;

        assert(this.connectionProvider, `Can't start a transaction without a ConnectionPool.`);

        this.localStorage.set(TransactionContextKeys.TRANSACTION, this);
    }

    public get sessionId(): string {
        assert(this._connection, `pushContext() must be called before obtaining the sessionId`);
        return this._connection.sessionId();
    }

    public async query<T>(spec: QuerySpecification<T>): Promise<T[]> {
        assert(this._connection, `pushContext() must be called running a query`);
        try {
            const results = await this._connection.query(spec);
            return results;
        } catch (e) {
            throw DrivineError.withRootCause(e, spec);
        }
    }

    public async openCursor<T>(spec: CursorSpecification<T>): Promise<Cursor<T>> {
        assert(this._connection, `pushContext() must be called running a query`);
        const cursor = await this._connection.openCursor(spec);
        this._cursors.push(cursor);
        return cursor;
    }

    public async pushContext(context: string | symbol): Promise<void> {
        if (this.callStack.isEmpty()) {
            this._connection = await this.connectionProvider.connect();
            this._cursors = [];
            this.logger.verbose(`Starting transaction: ${this.id}`);
            await this._connection.startTransaction();
        }
        this.callStack.push(String(context));
        await this.configureIfNeeded();
    }

    public async popContext(): Promise<void> {
        this.callStack.pop();
        if (this.callStack.isEmpty()) {
            this.logger.verbose(`Closing ${this._cursors.length} open cursors.`);
            await Promise.all(this._cursors.map(async it => it.close()));
            if (this.rollback) {
                this.logger.verbose(`Transaction: ${this.id} successful, but is marked ROLLBACK. Rolling back.`);
                await this._connection.rollbackTransaction();
            } else {
                this.logger.verbose(`Committing transaction: ${this.id}`);
                await this._connection.commitTransaction();
            }
            await this.releaseClient();
        }
    }

    public async popContextWithError(e: Error): Promise<void> {
        if (!this._connection) {
            throw e;
        }
        this.callStack.pop();
        if (this.callStack.isEmpty()) {
            this.logger.verbose(`Rolling back transaction: ${this.id} due to error: ${e.message}`);
            await this._connection.rollbackTransaction();
            await this.releaseClient(e);
        }
    }

    /**
     * Manually signify that this transaction should be rolled back.
     */
    public markAsRollback(): void {
        this.rollback = true;
    }

    private async configureIfNeeded(): Promise<void> {
        // TODO : Call to platform specific config here
        return Promise.resolve();
    }

    private async releaseClient(error?: Error): Promise<void> {
        this.logger.verbose(`Releasing connection for transaction: ${this.id}`);
        await this._connection.release(error);
        TransactionContextHolder.instance.set(TransactionContextKeys.TRANSACTION, undefined);
    }
}
