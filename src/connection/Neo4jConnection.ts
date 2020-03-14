import { Connection } from '@/connection/Connection';
import { QuerySpecification } from '@/query/QuerySpecification';
import { StatementLogger } from '@/logger/StatementLogger';
import { CursorSpecification } from '@/cursor/CursorSpecification';
import { DrivineError } from '@/DrivineError';
import { Logger } from '@nestjs/common';
import { ResultMapper } from '@/mapper/ResultMapper';
import { DatabaseType } from '@/connection/DatabaseType';
import { Neo4jCursor } from '@/cursor/Neo4jCursor';
import RxSession from 'neo4j-driver/types/session-rx';
import RxTransaction from 'neo4j-driver/types/transaction-rx';
import RxResult from 'neo4j-driver/types/result-rx';

export class Neo4jConnection implements Connection {
    private logger = new Logger(Neo4jConnection.name);
    private transaction?: RxTransaction;

    constructor(readonly session: RxSession, readonly resultMapper: ResultMapper) {}

    sessionId(): string {
        return this.session['sessionId'];
    }

    async query<T>(spec: QuerySpecification<T>): Promise<any[]> {
        spec.finalize();
        const hrStart = process.hrtime();
        const logger = new StatementLogger(this.sessionId());

        let results;
        if (!this.transaction) {
            const observable = this.session.run(spec.appliedStatement(), spec.mapParameters(DatabaseType.NEO4J));
            results = await this.toRecords(observable);
        } else {
            const observable = this.transaction.run(spec.appliedStatement(), spec.mapParameters(DatabaseType.NEO4J));
            results = await this.toRecords(observable);
        }
        logger.log(spec, hrStart);
        return this.resultMapper.mapQueryResults<T>(results, spec);
    }

    async openCursor<T>(spec: CursorSpecification<T>): Promise<Neo4jCursor<T>> {
        return Promise.resolve(new Neo4jCursor<T>(this.sessionId(), spec, this));
    }

    async startTransaction(): Promise<void> {
        this.transaction = await (this.session.beginTransaction().toPromise());
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
        return this.session.close().toPromise();
    }

    private async toRecords(observable: RxResult): Promise<Record<string, any>[]> {
        const results: Record<string, any>[] = [];
        return new Promise((resolve, reject) => {
            observable.records().subscribe({
                next: (data) => results.push(data),
                complete: () => resolve(results),
                error: error => reject(error)
            });
        });
    }

}
