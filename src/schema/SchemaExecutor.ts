import { ConnectionProvider } from '@/connection/ConnectionProvider';
import { DatabaseType } from '@/connection/DatabaseType';
import { FalkorDbConnectionProvider } from '@/connection/falkordb/FalkorDbConnectionProvider';
import { DrivineError } from '@/DrivineError';
import { QuerySpecification } from '@/query/QuerySpecification';
import { NativeOperation } from '@/schema/SchemaGrammar';
import { whenNotContended } from '@/manager/Contention';
import { Neo4jError } from 'neo4j-driver';

/** A transient error over Bolt, or FalkorDB turning a write away while another is in progress. */
function contended(failure: unknown): boolean {
    for (let cause: any = failure, depth = 0; cause && depth < 10; cause = cause.rootCause ?? cause.cause, depth++) {
        if (
            (cause instanceof Neo4jError && Neo4jError.isRetriable(cause)) ||
            /another write is in progress/i.test(cause.message ?? '')
        ) {
            return true;
        }
    }
    return false;
}

/**
 * A row of one column as that column's value, as the graph engines and Oracle give a record of one column: Postgres
 * gives a row as a record of its columns.
 */
function valueOf(row: any): any {
    const keys = row !== null && typeof row === 'object' ? Object.keys(row) : [];
    return keys.length === 1 ? row[keys[0]] : row;
}

/**
 * Runs schema statements on a connection of their own, in auto-commit: schema DDL can't run inside a data transaction.
 */
export class SchemaExecutor {
    /**
     * @param prepare what is done once before a statement runs, as an object manager makes its store first: a
     * listing reads the catalog the store keeps.
     */
    constructor(
        private readonly provider: ConnectionProvider,
        private readonly prepare?: () => Promise<void>
    ) {}

    /** Runs a statement, again after a pause when the engine turned it away because another write was in progress. */
    async run(statement: string | NativeOperation, bindings: Record<string, any> = {}): Promise<any[]> {
        await this.prepare?.();
        return whenNotContended(async () => this.runOnce(statement, bindings), contended);
    }

    private async runOnce(statement: string | NativeOperation, bindings: Record<string, any>): Promise<any[]> {
        if (typeof statement !== 'string') {
            return this.native(statement);
        }
        const connection = await this.provider.connect();
        try {
            const rows = await connection.query(new QuerySpecification(statement).bind(bindings));
            await connection.release();
            return this.provider.type === DatabaseType.POSTGRES ? rows.map(valueOf) : rows;
        } catch (e) {
            await connection.release(e as Error);
            throw DrivineError.withRootCause(e as Error);
        }
    }

    private async native(operation: NativeOperation): Promise<any[]> {
        if (!(this.provider instanceof FalkorDbConnectionProvider)) {
            throw new DrivineError(`${operation.native} is a FalkorDB command.`);
        }
        await this.provider.constraint(
            operation.native === 'CONSTRAINT_CREATE' ? 'CREATE' : 'DROP',
            operation.label,
            operation.properties
        );
        return [];
    }
}
