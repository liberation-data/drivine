import * as oracledb from 'oracledb';
import { Connection } from '@/connection/Connection';
import { QuerySpecification } from '@/query/QuerySpecification';
import { ResultMapper } from '@/mapper/ResultMapper';
import { CursorSpecification } from '@/cursor/CursorSpecification';
import { StatementLogger } from '@/logger/StatementLogger';
import { DrivineLogger } from '@/logger';
import { OracleSpecCompiler } from '@/connection/oracle/OracleSpecCompiler';
import { OracleCursor } from '@/connection/oracle/OracleCursor';

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

    constructor(
        readonly connection: oracledb.Connection,
        readonly resultMapper: ResultMapper,
        private readonly id: string
    ) {}

    sessionId(): string {
        return this.id;
    }

    async query<T>(spec: QuerySpecification<T>): Promise<any[]> {
        const finalized = spec.finalizedCopy('SQL');
        const compiled = new OracleSpecCompiler(finalized).compile();
        const hrStart = process.hrtime();
        const result = await this.connection.execute<any>(compiled.statement, compiled.parameters, {
            ...EXECUTE_OPTIONS,
            autoCommit: !this.inTransaction
        });
        new StatementLogger(this.sessionId()).log(spec, hrStart);
        const rows = result.rows ?? implicitRows(result.implicitResults?.[0] as any[] | undefined);
        return this.resultMapper.mapQueryResults<T>(rows, finalized);
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
}

/**
 * The rows a PL/SQL block returned. A block returns JSON as text, in a column named `<name>:json`, which is parsed here
 * and named `<name>`: node-oracledb 7 drops the last row of a returned result set with a JSON column (thin mode,
 * Oracle 23.26).
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
