import { ConnectionProvider } from '@/connection/ConnectionProvider';
import { FalkorDbConnectionProvider } from '@/connection/falkordb/FalkorDbConnectionProvider';
import { DrivineError } from '@/DrivineError';
import { QuerySpecification } from '@/query/QuerySpecification';
import { NativeOperation } from '@/schema/SchemaGrammar';

/**
 * Runs schema statements on a connection of their own, in auto-commit: schema DDL can't run inside a data transaction.
 */
export class SchemaExecutor {
    constructor(private readonly provider: ConnectionProvider) {}

    async run(statement: string | NativeOperation, bindings: Record<string, any> = {}): Promise<any[]> {
        if (typeof statement !== 'string') {
            return this.native(statement);
        }
        const connection = await this.provider.connect();
        try {
            const rows = await connection.query(new QuerySpecification(statement).bind(bindings));
            await connection.release();
            return rows;
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
