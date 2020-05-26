import { Connection } from '@/connection/Connection';
import { QuerySpecification } from '@/query/QuerySpecification';
import { StatementLogger } from '@/logger/StatementLogger';
import { CursorSpecification } from '@/cursor/CursorSpecification';
import { DrivineError } from '@/DrivineError';
import { Session, Transaction } from 'neo4j-driver';
import { Logger } from '@nestjs/common';
import { ResultMapper } from '@/mapper/ResultMapper';
import { DatabaseType } from '@/connection/DatabaseType';
import { Neo4jCursor } from '@/cursor/Neo4jCursor';

export class Neo4jConnection implements Connection {
    private logger = new Logger(Neo4jConnection.name);
    private transaction?: Transaction;

    constructor(readonly session: Session, readonly resultMapper: ResultMapper) {}

    sessionId(): string {
        return this.session['sessionId'];
    }

    async query<T>(spec: QuerySpecification<T>): Promise<any[]> {
        spec.finalize();
        const hrStart = process.hrtime();
        const logger = new StatementLogger(this.sessionId());
        let result;
        if (!this.transaction) {
            result = await this.session.run(spec.appliedStatement(), spec.mapParameters(DatabaseType.NEO4J));
        } else {
            result = await this.transaction.run(spec.appliedStatement(), spec.mapParameters(DatabaseType.NEO4J));
        }
        logger.log(spec, hrStart);
        return this.resultMapper.mapQueryResults<T>(result.records, spec);
    }

    async openCursor<T>(spec: CursorSpecification<T>): Promise<Neo4jCursor<T>> {
        return Promise.resolve(new Neo4jCursor<T>(this.sessionId(), spec, this));
    }

    async startTransaction(): Promise<void> {
        this.transaction = this.session.beginTransaction();
        return Promise.resolve();
    }

    async commitTransaction(): Promise<void> {
        if (!this.transaction) {
            throw new DrivineError(`There is no transaction to commit.`);
        }
        await this.transaction.commit();
    }

    async rollbackTransaction(): Promise<void> {
        if (!this.transaction) {
            throw new DrivineError(`There is no transaction to commit.`);
        }
        await this.transaction.rollback();
    }

    async release(err?: Error): Promise<void> {
        if (err) {
            this.logger.warn(`Closing session with error: ${err}`);
        }
        return this.session.close();
    }
}
