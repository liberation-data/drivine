import { Connection } from '@/connection/Connection';
import { PoolClient } from 'pg';
import { QuerySpecification } from '@/query/QuerySpecification';
import { ResultMapper } from '@/mapper/ResultMapper';
import { CursorSpecification } from '@/cursor/CursorSpecification';
import { PostgresCursor } from '@/connection/postgres/PostgresCursor';
import { StatementLogger } from '@/logger/StatementLogger';
import { DrivineLogger } from '@/logger';
import { PostgresSpecCompiler } from '@/connection/postgres/PostgresSpecCompiler';

const PgCursor = require('pg-cursor');

export class PostgresConnection implements Connection {
    private logger = new DrivineLogger(PostgresConnection.name);

    constructor(
        readonly client: PoolClient,
        readonly resultMapper: ResultMapper
    ) {}

    sessionId(): string {
        return this.client['sessionId'];
    }

    async query<T>(spec: QuerySpecification<T>): Promise<any[]> {
        const finalizedSpec = spec.finalizedCopy('SQL');
        const compiledSpec = new PostgresSpecCompiler(finalizedSpec).compile();
        const hrStart = process.hrtime();
        const logger = new StatementLogger(this.sessionId());
        const result = await this.client.query(compiledSpec.statement, compiledSpec.parameters);
        logger.log(spec, hrStart);
        return this.resultMapper.mapQueryResults<T>(result.rows, finalizedSpec);
    }

    async openCursor<T>(spec: CursorSpecification<T>): Promise<PostgresCursor<T>> {
        const finalizedSpec = spec.finalizedCopy('SQL');
        const compiledSpec = new PostgresSpecCompiler(finalizedSpec).compile();
        const pgCursorSpec = new PgCursor(compiledSpec.statement, compiledSpec.parameters);
        const pgCursor = await this.client.query(pgCursorSpec);
        return new PostgresCursor<T>(this.sessionId(), finalizedSpec, pgCursor, this.resultMapper);
    }

    async startTransaction(): Promise<void> {
        await this.client.query(`BEGIN`);
    }

    async commitTransaction(): Promise<void> {
        await this.client.query(`COMMIT`);
    }

    async rollbackTransaction(): Promise<void> {
        await this.client.query(`ROLLBACK`);
    }

    async release(err?: Error): Promise<void> {
        if (err) {
            this.logger.warn(`Closing session with error: ${err}`);
        }
        this.client.release(err);
        return Promise.resolve();
    }
}
