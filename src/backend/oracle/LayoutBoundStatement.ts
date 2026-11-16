import { GraphStatement } from '@/backend/GraphStatement';
import { writeProps } from '@/cypher/ValueLayout';
import { QuerySpecification } from '@/query/QuerySpecification';

/**
 * A block whose `$set` and whose `$rows`' `props`, bound by the manager as it runs it, are written in the store layout
 * (see writeProps), as the values of a save are.
 */
export class LayoutBoundStatement extends GraphStatement {
    spec<T>(more: Record<string, any> = {}): QuerySpecification<T> {
        const bound: Record<string, any> = { ...more };
        if (bound.set != null) {
            bound.set = writeProps(bound.set);
        }
        if (Array.isArray(bound.rows)) {
            bound.rows = bound.rows.map((row: any) =>
                row !== null && typeof row === 'object' && row.props != null
                    ? { ...row, props: writeProps(row.props) }
                    : row
            );
        }
        return super.spec<T>(bound);
    }
}
