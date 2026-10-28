import * as oracledb from 'oracledb';
import { Connection } from '@/connection/Connection';
import { QuerySpecification } from '@/query/QuerySpecification';
import { ResultMapper } from '@/mapper/ResultMapper';
import { CursorSpecification } from '@/cursor/CursorSpecification';
import { StatementLogger } from '@/logger/StatementLogger';
import { DrivineLogger } from '@/logger';
import { OracleSpecCompiler } from '@/connection/oracle/OracleSpecCompiler';
import { OracleCursor } from '@/connection/oracle/OracleCursor';
import { compiledSpecification } from '@/cypher/sql/CompiledSpecification';
import { OracleCypherCompiler } from '@/cypher/sql/OracleCypherCompiler';
import { DEFAULT_GRAPH } from '@/backend/sql/SqlGraph';
import { OracleStoredFunctions } from '@/backend/oracle/OracleStoredFunctions';

/** What every statement is run with: rows as objects, CLOBs read as text. */
const EXECUTE_OPTIONS: oracledb.ExecuteOptions = {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
    fetchTypeHandler: (meta: oracledb.Metadata<any>) =>
        meta.dbType === oracledb.DB_TYPE_CLOB ? { type: oracledb.STRING } : undefined
};

/**
 * A connection to Oracle. Outside a transaction each statement commits itself, as a statement does on the graph
 * engines. A PL/SQL block hands its rows back with `DBMS_SQL.RETURN_RESULT`; the first such set is its result.
 */
export class OracleConnection implements Connection {
    private readonly logger = new DrivineLogger(OracleConnection.name);
    private inTransaction = false;

    /**
     * @param graph the graph a Cypher statement is compiled against: its tables are `<graph>_node` and `<graph>_edge`
     * @param database the database and the user the session is of: whether it may call the graph's functions is
     * remembered for them (see {@link OracleStoredFunctions})
     */
    constructor(
        readonly connection: oracledb.Connection,
        readonly resultMapper: ResultMapper,
        private readonly id: string,
        private readonly graph: string = DEFAULT_GRAPH,
        private readonly database: string = ''
    ) {}

    sessionId(): string {
        return this.id;
    }

    /**
     * Runs the statement. A Cypher statement is compiled to SQL over the graph's tables, so a statement written for a
     * graph engine runs here and gives the same rows; one that writes is a PL/SQL block.
     */
    async query<T>(spec: QuerySpecification<T>): Promise<any[]> {
        const given = spec.finalizedCopy('SQL');
        const cypher = given.statement.language === 'CYPHER';
        const finalized = cypher ? await this.compiled(given) : given;
        const compiled = new OracleSpecCompiler(finalized).compile();
        const hrStart = process.hrtime();
        const result = await this.connection.execute<any>(compiled.statement, compiled.parameters, {
            ...EXECUTE_OPTIONS,
            autoCommit: !this.inTransaction,
            // Oracle keeps a cursor's memory while the driver keeps its statement, and a compiled Cypher statement holds
            // megabytes of it: about 4 MB, and over 20 MB where it reads a text past 32 KB. Kept in the driver's cache, 30
            // statements a session, a few dozen ran the instance out of PGA (ORA-04036, liberation-data/drivine4j#313).
            // Closed, its memory goes back. Drivine's own statements, a few the same each time, are still kept.
            keepInStmtCache: !cypher
        });
        new StatementLogger(this.sessionId()).log(spec, hrStart);
        const rows = result.rows ?? implicitRows(result.implicitResults?.[0] as any[] | undefined);
        // A Cypher statement that writes returns its rows in one: see OracleCypherCompiler.returnRows.
        const returned = cypher && !result.rows ? (rows[0]?.rows ?? []).map((it: any) => ({ result: it })) : rows;
        return this.resultMapper.mapQueryResults<T>(returned, finalized);
    }

    async openCursor<T>(spec: CursorSpecification<T>): Promise<OracleCursor<T>> {
        const finalized = spec.finalizedCopy('SQL');
        const compiled = new OracleSpecCompiler(finalized).compile();
        const result = await this.connection.execute<any>(compiled.statement, compiled.parameters, {
            ...EXECUTE_OPTIONS,
            resultSet: true
        });
        return new OracleCursor<T>(this.sessionId(), finalized, result.resultSet!, this.resultMapper);
    }

    async startTransaction(): Promise<void> {
        // Oracle begins a transaction with the first statement that writes; until commit, none commits itself.
        this.inTransaction = true;
        return Promise.resolve();
    }

    async commitTransaction(): Promise<void> {
        this.inTransaction = false;
        await this.connection.commit();
    }

    async rollbackTransaction(): Promise<void> {
        this.inTransaction = false;
        await this.connection.rollback();
    }

    async release(err?: Error): Promise<void> {
        if (err) {
            this.logger.warn(`Closing session with error: ${err}`);
        }
        if (this.inTransaction) {
            this.inTransaction = false;
            await this.connection.rollback();
        }
        await this.connection.close();
    }

    /**
     * The Cypher statement `given` compiled for Oracle, calling the functions the graph's store keeps where the
     * statement needs one and the session may call it, and compiled again to call none where it may not: see
     * {@link OracleStoredFunctions}.
     */
    private async compiled<T>(given: QuerySpecification<T>): Promise<QuerySpecification<T>> {
        const compiler = new OracleCypherCompiler(this.graph);
        const compiled = compiledSpecification(given, compiler).spec;
        if (
            !compiler.callsStoredNullsEqual ||
            (await OracleStoredFunctions.nullsEqual(this.connection, this.database, this.graph))
        ) {
            return compiled;
        }
        return compiledSpecification(given, new OracleCypherCompiler(this.graph, false)).spec;
    }
}

/**
 * The rows a PL/SQL block returned. A block returns JSON as text, in a column named `<name>:json`, which is parsed here
 * and named `<name>`: in thin mode, a returned result set with a JSON column gives only its prefetched rows
 * (oracle/node-oracledb#1795, 7.0.1 and 26.0.0 on Oracle 23.26).
 */
function implicitRows(rows: any[] | undefined): any[] {
    return (rows ?? []).map((row) => {
        const out: Record<string, any> = {};
        for (const [key, value] of Object.entries(row)) {
            if (key.endsWith(':json')) {
                out[key.slice(0, -':json'.length)] = value == null ? value : JSON.parse(value as string);
            } else {
                out[key] = value;
            }
        }
        return out;
    });
}
