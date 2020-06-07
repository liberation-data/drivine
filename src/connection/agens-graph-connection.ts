import { Connection } from '@/connection/Connection';
import { PoolClient } from 'pg';
import { QuerySpecification } from '@/query/query-specification';
import { ResultMapper } from '@/mapper/result-mapper';
import { CursorSpecification } from '@/cursor/cursor-specification';
import { AgensGraphCursor } from '@/cursor/agens-graph-cursor';
import { StatementLogger } from '@/logger/statement-logger';
import { DatabaseType } from '@/connection/database-type';
import { DrivineLogger } from '@/logger';

const PgCursor = require('pg-cursor');

export class AgensGraphConnection implements Connection {
    private logger = new DrivineLogger(AgensGraphConnection.name);

    constructor(readonly client: PoolClient, readonly resultMapper: ResultMapper) {}

    sessionId(): string {
        return this.client['sessionId'];
    }

    async query<T>(spec: QuerySpecification<T>): Promise<any[]> {
        spec.finalize();
        const hrStart = process.hrtime();
        const logger = new StatementLogger(this.sessionId());
        const result = await this.client.query(spec.appliedStatement(), spec.mapParameters(DatabaseType.AGENS_GRAPH));
        logger.log(spec, hrStart);
        return this.resultMapper.mapQueryResults<T>(result.rows, spec);
    }

    async openCursor<T>(spec: CursorSpecification<T>): Promise<AgensGraphCursor<T>> {
        const pgCursorSpec = new PgCursor(spec.appliedStatement(), spec.mapParameters(DatabaseType.AGENS_GRAPH));
        const pgCursor = await this.client.query(pgCursorSpec);
        return new AgensGraphCursor<T>(this.sessionId(), spec, pgCursor, this.resultMapper);
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
