import { GraphStatement } from '@/backend/GraphStatement';
import { FragmentModel } from '@/model/FragmentModel';

/**
 * A save statement, and what the manager needs to read its result: whether the root was checked against a stamp,
 * and which stamp. The statement returns one row, the map `{found, now, related}`: the root's stamp before and after,
 * and for each of `stampedModels` the `{id, stamp}` of its nodes before and after. A checked save that found the root
 * changed or gone returns none, having written nothing.
 */
export class SaveStatement extends GraphStatement {
    /**
     * @param rootIdBound the root's id as the save bound it to find the node, where a SQL store's save binds an id
     * unchanged since its load as the tag the store held it as (see SaveStatementBuilder's boundIdOf): what a read of the
     * root's stamp after a stale save binds too. Undefined where it is the id the object holds.
     */
    constructor(
        text: string,
        bindings: Record<string, any>,
        readonly root: FragmentModel,
        readonly rootObject: any,
        readonly expectedStamp?: string,
        readonly stampedModels: FragmentModel[] = [],
        readonly rootIdBound?: unknown
    ) {
        super(text, bindings);
    }
}
