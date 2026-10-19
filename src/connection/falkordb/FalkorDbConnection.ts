import { Connection } from '@/connection/Connection';
import { QuerySpecification } from '@/query/QuerySpecification';
import { StatementLogger } from '@/logger/StatementLogger';
import { CursorSpecification } from '@/cursor/CursorSpecification';
import { ResultMapper } from '@/mapper/ResultMapper';
import { DrivineLogger } from '@/logger';
import { AutoCommitTransactions } from '@/connection/AutoCommitTransactions';
import { FalkorDbCursor } from '@/connection/falkordb/FalkorDbCursor';
import { FalkorDbSpecCompiler } from '@/connection/falkordb/FalkorDbSpecCompiler';

/**
 * The part of the falkordb client's Graph that a connection uses.
 */
export interface FalkorDbGraph {
    query<T>(query: string, options?: { params?: Record<string, any> }): Promise<{ data?: T[] }>;
}

/**
 * FalkorDB commits each statement as it runs. Transaction boundaries are handled by {@link AutoCommitTransactions},
 * according to the connection's {@link TransactionMode}.
 */
export class FalkorDbConnection implements Connection {
    private logger = new DrivineLogger(FalkorDbConnection.name);

    constructor(
        readonly graph: FalkorDbGraph,
        readonly resultMapper: ResultMapper,
        readonly transactions: AutoCommitTransactions,
        private readonly id: string
    ) {}

    sessionId(): string {
        return this.id;
    }

    async query<T>(spec: QuerySpecification<T>): Promise<any[]> {
        const finalizedSpec = spec.finalizedCopy('CYPHER');
        const compiledSpec = new FalkorDbSpecCompiler(finalizedSpec).compile();
        const hrStart = process.hrtime();
        const logger = new StatementLogger(this.sessionId());
        const params = compiledSpec.parameters;
        const result = await this.graph.query<any>(
            compiledSpec.statement,
            Object.keys(params).length ? { params } : undefined
        );
        logger.log(spec, hrStart);
        return this.resultMapper.mapQueryResults<T>(result.data ?? [], finalizedSpec);
    }

    async openCursor<T>(spec: CursorSpecification<T>): Promise<FalkorDbCursor<T>> {
        return Promise.resolve(new FalkorDbCursor<T>(this.sessionId(), spec.finalizedCopy('CYPHER'), this));
    }

    async startTransaction(): Promise<void> {
        this.transactions.start();
        return Promise.resolve();
    }

    async commitTransaction(): Promise<void> {
        this.transactions.commit();
        return Promise.resolve();
    }

    async rollbackTransaction(): Promise<void> {
        this.transactions.rollback();
        return Promise.resolve();
    }

    async release(err?: Error): Promise<void> {
        if (err) {
            this.logger.warn(`Releasing connection with error: ${err}`);
        }
        // The client is shared by the provider, which closes it in end().
        return Promise.resolve();
    }
}
