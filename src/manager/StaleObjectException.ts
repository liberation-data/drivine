import { DrivineError } from '@/DrivineError';

/**
 * A save was refused because the node is no longer as the object's stamp says: another writer changed or deleted it
 * since the object was loaded. Nothing was written. Load the object again and re-apply the change.
 */
export class StaleObjectException extends DrivineError {
    constructor(
        readonly type: Function,
        readonly id: unknown,
        readonly expectedStamp: string,
        /** What the node carries now; undefined when it is gone, or when the engine turned the save away each time. */
        readonly foundStamp: string | undefined,
        /** Whether the node is gone. */
        readonly deleted: boolean,
        cause?: Error
    ) {
        super(
            deleted
                ? `${type.name} '${String(id)}' was deleted since it was loaded.`
                : foundStamp == null
                ? `${type.name} '${String(
                      id
                  )}' may have changed since it was loaded: another writer held it each time the save was tried.`
                : `${type.name} '${String(
                      id
                  )}' changed since it was loaded: expected stamp ${expectedStamp}, found ${foundStamp}.`,
            cause
        );
        this.name = 'StaleObjectException';
    }
}
