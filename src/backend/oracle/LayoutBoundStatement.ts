import { GraphStatement } from '@/backend/GraphStatement';
import { writeLayout, writeProps } from '@/cypher/ValueLayout';
import { QuerySpecification } from '@/query/QuerySpecification';

/**
 * A block whose `$set` and `$vectors`, whose `$rows`, `{id, props, vectors}` each, and whose `$id`, bound by the manager as
 * it runs it, are written as Oracle's store layout holds them (see writeProps), as the values of a save are: each float
 * extended JSON's double, which the block reads `JSON(… EXTENDED)`, so a float patched in stays a binary double. A patch
 * merges its vectors into the node's properties.
 */
export class LayoutBoundStatement extends GraphStatement {
    spec<T>(more: Record<string, any> = {}): QuerySpecification<T> {
        const bound: Record<string, any> = { ...more };
        for (const name of ['set', 'vectors']) {
            if (bound[name] != null) {
                bound[name] = writeProps(bound[name], 'oracle');
            }
        }
        if (bound.id !== undefined) {
            bound.id = writeLayout(bound.id, 'oracle');
        }
        if (Array.isArray(bound.rows)) {
            bound.rows = writeLayout(
                bound.rows.map((row: any) =>
                    row !== null && typeof row === 'object' && row.props != null
                        ? { ...row, props: cleared(row.props), vectors: row.vectors && cleared(row.vectors) }
                        : row
                ),
                'oracle'
            );
        }
        return super.spec<T>(bound);
    }
}

/** The properties a patch writes, one undefined written null, as a save clears it (see writeProps). */
function cleared(props: Record<string, any>): Record<string, any> {
    return Object.fromEntries(Object.entries(props).map(([name, value]) => [name, value ?? null]));
}
