import { SaveStatement } from '@/backend/SaveStatement';

/**
 * A checked save of a batch found its root stale. Internal: the batch is abandoned, and once its transaction is rolled
 * back the manager reports a StaleObjectException.
 */
export class StaleInBatch extends Error {
    constructor(readonly statement: SaveStatement) {
        super(`A checked save of a batch found ${statement.root.type.name} '${String(statement.bindings.root.id)}' stale.`);
    }
}
