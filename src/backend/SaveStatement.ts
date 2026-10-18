import { GraphStatement } from '@/backend/GraphStatement';
import { FragmentModel } from '@/model/FragmentModel';

/**
 * A save statement, and what the manager needs to read its result: whether the root was checked against a stamp,
 * and which stamp. The statement returns one row, the map `{found, now}`, the root's stamp before and after; a checked save
 * that found the root changed or gone returns none, having written nothing.
 */
export class SaveStatement extends GraphStatement {
    constructor(
        text: string,
        bindings: Record<string, any>,
        readonly root: FragmentModel,
        readonly rootObject: any,
        readonly expectedStamp?: string
    ) {
        super(text, bindings);
    }
}
