import { Connection } from '@/connection/Connection';
import { PoolClient } from 'pg';
import { QuerySpecification } from '@/query/QuerySpecification';
import { ResultMapper } from '@/mapper/ResultMapper';
import { CursorSpecification } from '@/cursor/CursorSpecification';
import { PostgresCursor } from '@/connection/postgres/PostgresCursor';
import { StatementLogger } from '@/logger/StatementLogger';
import { DrivineLogger } from '@/logger';
import { PostgresSpecCompiler } from '@/connection/postgres/PostgresSpecCompiler';
import { compiledSpecification } from '@/cypher/sql/CompiledSpecification';
import { PostgresCypherCompiler } from '@/cypher/sql/PostgresCypherCompiler';
import { DEFAULT_GRAPH } from '@/backend/sql/SqlGraph';

const PgCursor = require('pg-cursor');

export class PostgresConnection implements Connection {
    private logger = new DrivineLogger(PostgresConnection.name);

    /**
     * @param graph the graph a Cypher statement is compiled against: its tables are `<graph>_node` and `<graph>_edge`
     */
    constructor(
        readonly client: PoolClient,
        readonly resultMapper: ResultMapper,
        private readonly graph: string = DEFAULT_GRAPH
    ) {}

    sessionId(): string {
        return (this.client as PoolClient & { sessionId: string }).sessionId;
    }

    /**
     * Runs the statement. A Cypher statement is compiled to SQL over the graph's tables, so a statement written for a
     * graph engine runs here and gives the same rows: one value a row, from the compiled statement's one column.
     */
    async query<T>(spec: QuerySpecification<T>): Promise<any[]> {
        const given = spec.finalizedCopy('SQL');
        const cypher =
            given.statement.language === 'CYPHER'
                ? compiledSpecification(given, new PostgresCypherCompiler(this.graph))
                : undefined;
        const finalizedSpec = cypher?.spec ?? given;
        const compiledSpec = new PostgresSpecCompiler(finalizedSpec).compile();
        const hrStart = process.hrtime();
        const logger = new StatementLogger(this.sessionId());
        for (const statement of cypher?.setup ?? []) {
            await this.client.query(statement);
        }
        const result = await this.client.query(compiledSpec.statement, compiledSpec.parameters);
        logger.log(spec, hrStart);
        const rows = cypher ? result.rows.map((it) => it.result) : result.rows;
        return this.resultMapper.mapQueryResults<T>(rows, finalizedSpec);
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
