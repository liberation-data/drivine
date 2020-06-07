import { CursorSpecification } from '@/cursor';
import { Neo4jConnection } from '@/connection';
import { QuerySpecification } from '@/query';
import { AbstractCursor } from '@/cursor';

/**
 * This is a rudimentary placeholder for a pending implementation that will use the driver's streaming capabilities.
 */
export class Neo4jCursor<T> extends AbstractCursor<T> {
    private page: number;

    constructor(sessionId: string, spec: CursorSpecification<T>, private readonly connection: Neo4jConnection) {
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
                .transform(this.spec.transformType!)
                .map(this.spec.mapper!)
        );
        this.page++;
        return results;
    }

    async close(): Promise<void> {
        return Promise.resolve();
    }
}
