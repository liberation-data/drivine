import { Connection } from '@/connection';
import { DrivineError } from '@/DrivineError';
import { Cursor, CursorSpecification } from '@/cursor';
import { QuerySpecification } from '@/query';
import { Logger } from '@nestjs/common';
import { ResultMapper } from '@/mapper';
import { StatementLogger } from '@/logger';
import { RedisGraphSpecCompiler } from '@/query/RedisGraphSpecCompiler';
import { Redis } from 'ioredis';
import { RedisGraphResultSet } from '@/resultset/RedisGraphResultSet';

export class RedisGraphConnection implements Connection {

    private logger = new Logger(RedisGraphConnection.name);

    constructor(readonly redis: Redis, readonly graphName: string, readonly resultMapper: ResultMapper) {
    }

    async commitTransaction(): Promise<void> {
        return Promise.reject(new DrivineError(`Transactions are not yet supported`));
    }

    async openCursor<T>(cursorSpec: CursorSpecification<T>): Promise<Cursor<T>> {
        return Promise.reject(new DrivineError(`Cursors are not yet supported for: ${cursorSpec}`));
    }

    async query<T>(spec: QuerySpecification<T>): Promise<any[]> {
        const finalizedSpec = spec.finalizedCopy('CYPHER');
        const compiledSpec = new RedisGraphSpecCompiler(finalizedSpec).compile();
        const hrStart = process.hrtime();
        const logger = new StatementLogger(this.sessionId());
        const result = await this.redis.send_command('GRAPH.QUERY', this.graphName, compiledSpec.statement);
        logger.log(spec, hrStart);
        const resultSet = new RedisGraphResultSet(result[0], result[1], result[2]);
        return this.resultMapper.mapQueryResults<T>(resultSet, finalizedSpec);
    }

    async release(err?: Error): Promise<void> {
        if (err) {
            this.logger.warn(`Closing session with error: ${err}`);
        }
        this.redis.disconnect();
        return Promise.resolve()
    }

    async rollbackTransaction(): Promise<void> {
        return Promise.reject(new DrivineError(`Transactions are not yet supported`));
    }

    sessionId(): string {
        return this.redis['sessionId'];
    }

    async startTransaction(): Promise<void> {
        return Promise.reject(new DrivineError(`Transactions are not yet supported`));
    }

}
