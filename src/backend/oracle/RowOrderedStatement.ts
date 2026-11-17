import { LayoutBoundStatement } from '@/backend/oracle/LayoutBoundStatement';
import { QuerySpecification } from '@/query/QuerySpecification';

/**
 * patchMany's block, each of whose results, one per row of `$rows` in their order, is handed the id of its row as the
 * manager bound it, which the manager matches the results to its objects by. The id the block gives back is Oracle's
 * text of the id the node holds, plain JSON, where a float is a binary double whose text need not read back as the
 * number bound (`0.1 + 0.2`), and a whole number past 2^53 is read as a number, not the bigint bound: either would leave
 * its object with no result.
 */
export class RowOrderedStatement extends LayoutBoundStatement {
    spec<T>(more: Record<string, any> = {}): QuerySpecification<T> {
        const rows: any[] = Array.isArray(more.rows) ? more.rows : [];
        return super.spec<T>(more).addPostProcessors({
            apply: (results: any[]) => results.map((it, i) => ({ ...it, id: rows[i]?.id }))
        });
    }
}
