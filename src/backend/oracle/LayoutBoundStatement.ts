import { GraphStatement } from '@/backend/GraphStatement';
import { writeProps } from '@/cypher/ValueLayout';
import { QuerySpecification } from '@/query/QuerySpecification';

/**
 * A block whose `$set` and `$vectors`, and whose `$rows`' `props` and `vectors`, bound by the manager as it runs it, are
 * written in the store layout (see writeProps), as the values of a save are: a patch merges its vectors into the node's
 * properties.
 */
export class LayoutBoundStatement extends GraphStatement {
    spec<T>(more: Record<string, any> = {}): QuerySpecification<T> {
        const bound: Record<string, any> = { ...more };
        for (const name of ['set', 'vectors']) {
            if (bound[name] != null) {
                bound[name] = writeProps(bound[name]);
            }
        }
        if (Array.isArray(bound.rows)) {
            bound.rows = bound.rows.map((row: any) =>
                row !== null && typeof row === 'object' && row.props != null
                    ? { ...row, props: writeProps(row.props), vectors: row.vectors && writeProps(row.vectors) }
                    : row
            );
        }
        return super.spec<T>(bound);
    }
}
