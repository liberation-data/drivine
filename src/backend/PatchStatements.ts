import { labelExpression, quoteName } from '@/backend/Cypher';
import { changes, LOCK, OFFERED, restamp, STAMP, twoTokensOf } from '@/backend/CypherStamps';
import { GraphStatement } from '@/backend/GraphStatement';
import { DrivineError } from '@/DrivineError';
import { FragmentModel } from '@/model/FragmentModel';
import { Stamps } from '@/model/Stamps';

/**
 * Statements that write named properties of nodes found by id, making none. Each node found is locked, then found
 * again with the condition, so the condition reads what the last writer committed; it sits in a WHERE, the only place
 * Memgraph takes an existence check. A node whose values were already as set keeps its stamp; one that changed gets a
 * new data token; one that never had a stamp is given one.
 */
export class PatchStatements {
    /** Patches one node, the one with id `$id`, setting `$set`. Returns `{found, applied, changed}`. */
    static one(model: FragmentModel, where?: string): GraphStatement {
        const labels = labelExpression(model.labels);
        const id = `{${quoteName(idProperty(model))}: $id}`;
        return new GraphStatement(
            [
                `OPTIONAL MATCH (f${labels} ${id})`,
                `SET f.${LOCK} = true REMOVE f.${LOCK}`,
                'WITH f',
                `OPTIONAL MATCH (n${labels} ${id})${where ? ` WHERE ${where}` : ''}`,
                ...PatchStatements.write('$set'),
                'RETURN {found: f IS NOT NULL, applied: n IS NOT NULL, changed: changed} AS result'
            ].join('\n'),
            { _stamp: Stamps.fresh() }
        );
    }

    /** Patches a node per row of `$rows`, `{id, props}`. Returns `{id, found, changed}` per row. */
    static many(model: FragmentModel): GraphStatement {
        const labels = labelExpression(model.labels);
        return new GraphStatement(
            [
                'UNWIND $rows AS row',
                `OPTIONAL MATCH (f${labels} {${quoteName(idProperty(model))}: row.id})`,
                `SET f.${LOCK} = true REMOVE f.${LOCK}`,
                'WITH row, f, f AS n',
                ...PatchStatements.write('row.props', 'row'),
                'RETURN {id: row.id, found: f IS NOT NULL, changed: changed} AS result'
            ].join('\n'),
            { _stamp: Stamps.fresh() }
        );
    }

    private static write(props: string, carry?: string): string[] {
        const kept = carry ? `${carry}, ` : '';
        return [
            `WITH ${kept}f, n, CASE WHEN n IS NULL THEN false ELSE ${changes('n', props)} END AS changed`,
            `FOREACH (x IN CASE WHEN changed THEN [n] ELSE [] END | SET ${restamp('x', 'true')} SET x += ${props})`,
            `FOREACH (x IN CASE WHEN f IS NOT NULL AND ${twoTokensOf('f')} IS NULL THEN [f] ELSE [] END | SET x.${STAMP} = ${OFFERED})`
        ];
    }
}

function idProperty(model: FragmentModel): string {
    if (!model.nodeIdProperty) {
        throw new DrivineError(`${model.type.name} has no @NodeId property, so it can't be patched by id.`);
    }
    return model.nodeIdProperty;
}
