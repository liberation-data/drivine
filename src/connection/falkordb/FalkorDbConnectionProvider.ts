import { ConstraintType, EntityType, FalkorDB } from 'falkordb';
import { ConnectionProvider } from '@/connection/ConnectionProvider';
import { Connection } from '@/connection/Connection';
import { DatabaseType } from '@/connection/DatabaseType';
import { TransactionMode } from '@/connection/TransactionMode';
import { AutoCommitTransactions } from '@/connection/AutoCommitTransactions';
import { FalkorDbConnection } from '@/connection/falkordb/FalkorDbConnection';
import { FalkorDbResultMapper } from '@/connection/falkordb/FalkorDbResultMapper';
import ShortUniqueId from 'short-unique-id';

const shortId = new ShortUniqueId({ length: 7 });

export interface FalkorDbConnectionOptions {
    host: string;
    port: number;
    userName?: string;
    password?: string;
    connectionTimeout?: number;
}

export class FalkorDbConnectionProvider implements ConnectionProvider {
    private client?: Promise<FalkorDB>;
    private readonly transactions: AutoCommitTransactions;

    constructor(
        readonly name: string,
        readonly type: DatabaseType,
        readonly graphName: string,
        readonly options: FalkorDbConnectionOptions,
        readonly transactionMode: TransactionMode = TransactionMode.WARN
    ) {
        this.transactions = new AutoCommitTransactions('FalkorDB', transactionMode);
    }

    async connect(): Promise<Connection> {
        const graph = (await this.connectedClient()).selectGraph(this.graphName);
        return new FalkorDbConnection(graph, new FalkorDbResultMapper(), this.transactions, shortId.rnd());
    }

    /** Creates or drops a uniqueness constraint, a Redis command FalkorDB takes in place of DDL. */
    async constraint(operation: 'CREATE' | 'DROP', label: string, properties: string[]): Promise<void> {
        const graph = (await this.connectedClient()).selectGraph(this.graphName);
        if (operation === 'CREATE') {
            await graph.constraintCreate(ConstraintType.UNIQUE, EntityType.NODE, label, ...properties);
        } else {
            await graph.constraintDrop(ConstraintType.UNIQUE, EntityType.NODE, label, ...properties);
        }
    }

    async end(): Promise<void> {
        // Cleared before waiting, so a second call made meanwhile doesn't close the client again (which throws).
        const client = this.client;
        this.client = undefined;
        if (client) {
            await (await client).close();
        }
    }

    private async connectedClient(): Promise<FalkorDB> {
        if (!this.client) {
            this.client = FalkorDB.connect({
                username: this.options.userName,
                password: this.options.password,
                socket: {
                    host: this.options.host,
                    port: this.options.port,
                    connectTimeout: this.options.connectionTimeout
                }
            }).catch((e) => {
                this.client = undefined;
                throw e;
            });
        }
        return this.client;
    }
}
