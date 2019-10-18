import { Connection } from '@/connection/Connection';
import { PoolClient } from 'pg';
import { QuerySpecification } from '@/query/QuerySpecification';
import { ResultMapper } from '@/mapper/ResultMapper';
import { AgensGraphResultMapper } from '@/mapper/AgensGraphResultMapper';
import { CursorSpecification } from '@/cursor/CursorSpecification';
import { AgensGraphCursor } from '@/cursor/AgensGraphCursor';
import { StatementLogger } from '@/logger/StatementLogger';
import { Logger } from '@nestjs/common';
import { DatabaseType } from '@/connection/DatabaseType';

const PgCursor = require('pg-cursor');

export class AgensGraphConnection implements Connection {
    private logger = new Logger(AgensGraphConnection.name);

    public constructor(public readonly client: PoolClient, public readonly resultMapper: ResultMapper) {
        this.resultMapper = new AgensGraphResultMapper();
    }

    public sessionId(): string {
        return this.client['sessionId'];
    }

    public async query<T>(spec: QuerySpecification<T>): Promise<any[]> {
        const hrStart = process.hrtime();
        const logger = new StatementLogger(this.sessionId());
        const result = await this.client.query(spec.statement!, spec.mapParameters(DatabaseType.AGENS_GRAPH));
        logger.log(spec, hrStart);
        return this.resultMapper.mapQueryResults<T>(result.rows, spec);
    }

    public async openCursor<T>(spec: CursorSpecification<T>): Promise<AgensGraphCursor<T>> {
        const pgCursorSpec = new PgCursor(spec.statement, spec.mapParameters(DatabaseType.AGENS_GRAPH));
        const pgCursor = await this.client.query(pgCursorSpec);
        return new AgensGraphCursor<T>(this.sessionId(), spec, pgCursor, this.resultMapper);
    }

    public async startTransaction(): Promise<void> {
        await this.client.query(`BEGIN`);
    }

    public async commitTransaction(): Promise<void> {
        await this.client.query(`COMMIT`);
    }

    public async rollbackTransaction(): Promise<void> {
        await this.client.query(`ROLLBACK`);
    }

    public async release(err?: Error): Promise<void> {
        if (err) {
            this.logger.warn(`Closing session with error: ${err}`);
        }
        this.client.release(err);
        return Promise.resolve();
    }
}
