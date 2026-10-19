import { labelExpression, quoteName } from '@/backend/Cypher';
import { changes, LOCK, restamp, STAMP } from '@/backend/CypherStamps';
import { GraphStatement } from '@/backend/GraphStatement';
import { idOf, objectProps } from '@/backend/SaveStatementBuilder';
import { DrivineError } from '@/DrivineError';
import { FragmentModel } from '@/model/FragmentModel';
import { Stamps } from '@/model/Stamps';
import { SaveOptions } from '@/manager/SaveOptions';
import { CypherGrammar } from '@/backend/CypherGrammar';
import { splitVectors, vectorClauses } from '@/backend/VectorWrites';

/** The fragments of one class in a batch. */
export interface FragmentGroup {
    model: FragmentModel;
    objects: any[];
}

/**
 * Saves fragments of any number of classes in one statement: a FOREACH per class over its rows, each node merged on
 * its id and given its properties, stamped as a save stamps it. Stamps are not checked: a batch only adds. The stamps of
 * each class's nodes are read before and after, and the statement returns `{groups: [{before, after}]}`, each a list
 * of `{id, stamp}`, for the stamps to be handed back.
 */
export class FragmentBatchStatement {
    static build(groups: FragmentGroup[], options: SaveOptions<any>, grammar: CypherGrammar): GraphStatement {
        const bindings: Record<string, any> = { _stamp: Stamps.fresh() };
        const carried: string[] = ['_'];
        const parts = ['WITH 1 AS _'];
        groups.forEach((group, i) => {
            const rows = group.objects.map((it) => ({
                id: idOf(group.model, it),
                ...splitVectors(group.model, objectProps(group.model, it, options))
            }));
            bindings[`rows${i}`] = rows;
            bindings[`ids${i}`] = rows.map((it) => it.id);
            parts.push(...FragmentBatchStatement.read(group.model, i, 'before', carried));
            carried.push(`before${i}`);
        });
        groups.forEach((group, i) => {
            const id = quoteName(idProperty(group.model));
            const vectors = vectorClauses(group.model, grammar, 'n', 'row.vectors');
            const changed = [changes('n', 'row.props'), ...vectors.changes].join(' OR ');
            parts.push(
                `FOREACH (row IN $rows${i} | MERGE (n${labelExpression(group.model.labels)} {${id}: row.id}) ` +
                    `SET n.${LOCK} = true REMOVE n.${LOCK} SET ${restamp(
                        'n',
                        changed
                    )} SET n += row.props ${vectors.sets.join(' ')})`
            );
        });
        groups.forEach((group, i) => {
            parts.push(...FragmentBatchStatement.read(group.model, i, 'after', carried));
            carried.push(`after${i}`);
        });
        const result = groups.map((_, i) => `{before: before${i}, after: after${i}}`).join(', ');
        parts.push(`RETURN {groups: [${result}]} AS result`);
        return new GraphStatement(parts.join('\n'), bindings);
    }

    private static read(model: FragmentModel, i: number, when: 'before' | 'after', carried: string[]): string[] {
        const a = `${when[0]}${i}`;
        const id = quoteName(idProperty(model));
        return [
            `WITH ${carried.join(', ')}`,
            `OPTIONAL MATCH (${a}${labelExpression(model.labels)}) WHERE ${a}.${id} IN $ids${i}`,
            `WITH ${carried.join(', ')}, collect(CASE WHEN ${a} IS NOT NULL THEN {id: ${a}.${id}, ` +
                `stamp: coalesce(${a}.${STAMP}, '${Stamps.NEVER_STAMPED}')} END) AS ${when}${i}`
        ];
    }
}

function idProperty(model: FragmentModel): string {
    if (!model.nodeIdProperty) {
        throw new DrivineError(
            `${model.type.name} has no @NodeId property, so it can't be saved: a save merges on the id.`
        );
    }
    return model.nodeIdProperty;
}
