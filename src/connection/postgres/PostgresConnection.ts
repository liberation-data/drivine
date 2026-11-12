import { timerStart } from '@/utils/Timing';
import { Connection } from '@/connection/Connection';
import { CustomTypesConfig, PoolClient } from 'pg';
import { QuerySpecification } from '@/query/QuerySpecification';
import { ResultMapper } from '@/mapper/ResultMapper';
import { CursorSpecification } from '@/cursor/CursorSpecification';
import { PostgresCursor } from '@/connection/postgres/PostgresCursor';
import { StatementLogger } from '@/logger/StatementLogger';
import { DrivineLogger } from '@/logger';
import { PostgresSpecCompiler } from '@/connection/postgres/PostgresSpecCompiler';
import { CompiledSpecification, compiledSpecification } from '@/cypher/CompiledSpecification';
import { nonFiniteTypes, exactIntegerTypes, TypeParsers } from '@/connection/postgres/PostgresNonFinite';
import { SharedCypherCompiler } from '@/cypher/SharedCypherCompiler';
import { DEFAULT_GRAPH } from '@/backend/sql/SqlGraph';

const PgCursor = require('pg-cursor');

export class PostgresConnection implements Connection {
    private logger = new DrivineLogger(PostgresConnection.name);

    /** Whether {@link release} closes the session for good rather than giving it back to the pool: see {@link buildingIndex}. */
    private evicting = false;

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
                ? compiledSpecification(given, new SharedCypherCompiler('postgres', { name: this.graph }))
                : undefined;
        return this.run(spec, cypher?.spec ?? given, cypher);
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

    /**
     * Marks the session as one an index build runs on, so {@link release} closes it for good rather than giving it back
     * to the pool, whether the build passed or failed (liberation-data/drivine#641). A backend that has run anything in
     * parallel, as a `CREATE INDEX` over a table past `min_parallel_table_scan_size` is, keeps a dynamic shared memory
     * segment for as long as it lives, and the pool keeps it alive: enough of them left too little of a 64 MB `/dev/shm`
     * for an HNSW build, which asks for nearly all of `maintenance_work_mem` as one segment. Closed, the session's segment
     * goes with it, and the build keeps its parallel workers. The pool is always Drivine's own, and a schema statement's
     * session is always its own, never a transaction's, so it can always be closed.
     */
    buildingIndex(): void {
        this.evicting = true;
    }

    async release(err?: Error): Promise<void> {
        if (err) {
            this.logger.warn(`Closing session with error: ${err}`);
        }
        // node-postgres closes a client released with an error, or with true, rather than pooling it.
        this.client.release(err ?? (this.evicting || undefined));
        return Promise.resolve();
    }

    private async run<T>(
        spec: QuerySpecification<T>,
        finalizedSpec: QuerySpecification<T>,
        cypher?: CompiledSpecification<T>
    ): Promise<any[]> {
        const compiledSpec = new PostgresSpecCompiler(finalizedSpec).compile();
        const hrStart = timerStart();
        const logger = new StatementLogger(this.sessionId());
        // Before anything runs: where the stand-ins can't be read, nothing is. A compiled statement's JSON is read with
        // its whole numbers past 2^53 kept, NaN and the infinities too where it is given them.
        const parsers = this.client as unknown as TypeParsers;
        const types = cypher ? (cypher.nonFinite ? nonFiniteTypes(parsers) : exactIntegerTypes(parsers)) : undefined;
        for (const statement of cypher?.setup ?? []) {
            await this.client.query(statement);
        }
        const result = types
            ? await this.client.query({
                  text: compiledSpec.statement,
                  values: compiledSpec.parameters,
                  types: types as unknown as CustomTypesConfig
              })
            : await this.client.query(compiledSpec.statement, compiledSpec.parameters);
        logger.log(spec, hrStart);
        const rows = cypher ? result.rows.map((it) => it.result) : result.rows;
        return this.resultMapper.mapQueryResults<T>(rows, finalizedSpec);
    }
}
