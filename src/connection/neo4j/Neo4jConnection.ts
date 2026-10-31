import { Connection } from '@/connection/Connection';
import { QuerySpecification } from '@/query/QuerySpecification';
import { StatementLogger } from '@/logger/StatementLogger';
import { CursorSpecification } from '@/cursor/CursorSpecification';
import { DrivineError } from '@/DrivineError';
import { Session, Transaction } from 'neo4j-driver';
import { ResultMapper } from '@/mapper/ResultMapper';
import { Neo4jCursor } from '@/connection/neo4j/Neo4jCursor';
import { DrivineLogger } from '@/logger';
import { Neo4jSpecCompiler } from '@/connection/neo4j/Neo4jSpecCompiler';
import { transientOverBolt } from '@/backend/CypherGrammar';

export class Neo4jConnection implements Connection {
    private logger = new DrivineLogger(Neo4jConnection.name);
    private transaction?: Transaction;

    constructor(readonly session: Session, readonly resultMapper: ResultMapper) {}

    sessionId(): string {
        return (this.session as Session & { sessionId: string }).sessionId;
    }

    async query<T>(spec: QuerySpecification<T>): Promise<any[]> {
        const finalizedSpec = spec.finalizedCopy('CYPHER');
        const compiledSpec = new Neo4jSpecCompiler(finalizedSpec).compile();
        const hrStart = process.hrtime();
        const logger = new StatementLogger(this.sessionId());
        let result;
        if (!this.transaction) {
            result = await this.session.run(compiledSpec.statement, compiledSpec.parameters);
        } else {
            result = await this.transaction.run(compiledSpec.statement, compiledSpec.parameters);
        }
        logger.log(spec, hrStart);
        return this.resultMapper.mapQueryResults<T>(result.records, finalizedSpec);
    }

    async openCursor<T>(spec: CursorSpecification<T>): Promise<Neo4jCursor<T>> {
        return Promise.resolve(new Neo4jCursor<T>(this.sessionId(), spec.finalizedCopy('CYPHER'), this));
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

    /**
     * Closes the session. A failure is logged, at debug when the engine turned the statement away for another
     * session's (a deadlock or conflict): its caller runs it again, as a save and a schema statement are (see
     * `whenNotContended`), and one that still fails is thrown there. Otherwise each manager of several starting at once
     * would warn of each deadlock it got past making the store identity's constraint (#479).
     */
    async release(err?: Error): Promise<void> {
        if (err && transientOverBolt(err)) {
            this.logger.debug(`Closing session with error: ${err}`);
        } else if (err) {
            this.logger.warn(`Closing session with error: ${err}`);
        }
        return this.session.close();
    }
}
