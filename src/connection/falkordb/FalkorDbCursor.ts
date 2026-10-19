import { CursorSpecification } from '@/cursor/CursorSpecification';
import { FalkorDbConnection } from '@/connection/falkordb/FalkorDbConnection';
import { QuerySpecification } from '@/query/QuerySpecification';
import { AbstractCursor } from '@/cursor/AbstractCursor';

/**
 * Reads a batch at a time with SKIP and LIMIT, as the falkordb client has no streaming read.
 */
export class FalkorDbCursor<T> extends AbstractCursor<T> {
    private page: number;

    constructor(sessionId: string, spec: CursorSpecification<T>, private readonly connection: FalkorDbConnection) {
        super(sessionId, spec);
        this.page = 0;
    }

    async read(count: number): Promise<T[]> {
        const results = await this.connection.query(
            new QuerySpecification<T>()
                .withStatement(this.spec.statement!)
                .skip(count * this.page)
                .limit(count)
                .bind(this.spec.parameters)
                .addPostProcessors(...this.spec.postProcessors)
        );
        this.page++;
        return results;
    }

    async close(): Promise<void> {
        return Promise.resolve();
    }
}
