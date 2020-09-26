import { Connection } from '@/connection/Connection';
import { PoolClient } from 'pg';
import { QuerySpecification } from '@/query/QuerySpecification';
import { ResultMapper } from '@/mapper/ResultMapper';
import { CursorSpecification } from '@/cursor/CursorSpecification';
import { AgensGraphCursor } from '@/cursor/AgensGraphCursor';
import { StatementLogger } from '@/logger/StatementLogger';
import { DrivineLogger } from '@/logger';
import { AgensGraphSpecCompiler } from '@/query/AgensGraphSpecCompiler';
import { QueryLanguage } from '@/query';
import { AgensGraphResultSet } from '@/resultset/AgensGraphResultSet';

const PgCursor = require('pg-cursor');

export class AgensGraphConnection implements Connection {
    private logger = new DrivineLogger(AgensGraphConnection.name);

    constructor(readonly client: PoolClient,
                readonly resultMapper: ResultMapper,
                readonly defaultLanguage: QueryLanguage) {}

    sessionId(): string {
        return this.client['sessionId'];
    }

    async query<T>(spec: QuerySpecification<T>): Promise<any[]> {
        const finalizedSpec = spec.finalizedCopy(this.defaultLanguage);
        const compiledSpec = new AgensGraphSpecCompiler(finalizedSpec).compile();
        const hrStart = process.hrtime();
        const logger = new StatementLogger(this.sessionId());
        const result = await this.client.query(compiledSpec.statement, compiledSpec.parameters);
        logger.log(spec, hrStart);
        return this.resultMapper.mapQueryResults<T>(new AgensGraphResultSet(result.rows), finalizedSpec);
    }

    async openCursor<T>(spec: CursorSpecification<T>): Promise<AgensGraphCursor<T>> {
        const finalizedSpec = spec.finalizedCopy(this.defaultLanguage);
        const compiledSpec = new AgensGraphSpecCompiler(finalizedSpec).compile();
        const pgCursorSpec = new PgCursor(compiledSpec.statement, compiledSpec.parameters);
        const pgCursor = await this.client.query(pgCursorSpec);
        return new AgensGraphCursor<T>(this.sessionId(), finalizedSpec, pgCursor, this.resultMapper);
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
