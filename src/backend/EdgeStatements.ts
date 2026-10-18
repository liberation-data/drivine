import { Direction } from '@/annotation/Metadata';
import { labelExpression, quoteName } from '@/backend/Cypher';
import { LOCK, relink } from '@/backend/CypherStamps';
import { GraphStatement } from '@/backend/GraphStatement';
import { DrivineError } from '@/DrivineError';
import { FragmentModel } from '@/model/FragmentModel';
import { Stamps } from '@/model/Stamps';
import { RelateMode } from '@/manager/NodeRef';

/** A node matched by its fragment's labels (and any more) and its id. */
export interface MatchedNode {
    model: FragmentModel;
    id: unknown;
    labels?: string[];
}

/**
 * Statements for a relationship between two stored nodes, matched by id and never created. Each end gets a new links
 * token when a relationship is made, removed, or has its properties changed; neither node's own properties are touched.
 */
export class EdgeStatements {
    /** Joins `from` to `to`. Returns how many such relationships there are after: 0 when either node is absent. */
    static relate(
        from: MatchedNode,
        to: MatchedNode,
        type: string,
        properties: Record<string, any>,
        mode: RelateMode
    ): GraphStatement {
        assertType(type);
        const written = Object.entries(properties).filter(([, value]) => value != null);
        const bindings: Record<string, any> = { _fromId: from.id, _toId: to.id, _stamp: Stamps.fresh() };
        written.forEach(([, value], i) => (bindings[`_rel${i}`] = value));
        const sets = written.map(([key], i) => `r.${quoteName(key)} = $_rel${i}`);
        const merges = mode === RelateMode.MERGE;
        const changed = merges ? '_had = 0 OR _same < _had' : 'true';
        const parts = [`MATCH ${pattern('a', from, '$_fromId')}`, `MATCH ${pattern('b', to, '$_toId')}`];
        if (merges) {
            // Both locks are taken before the relationships between the two are counted, so the count still holds
            // when the MERGE runs.
            const same = [
                'x IS NOT NULL',
                ...written.map(([key], i) => `coalesce(x.${quoteName(key)} = $_rel${i}, false)`)
            ];
            parts.push(
                `SET a.${LOCK} = true, b.${LOCK} = true REMOVE a.${LOCK}, b.${LOCK}`,
                'WITH a, b',
                `OPTIONAL MATCH (a)-[x:${quoteName(type)}]->(b)`,
                `WITH a, b, count(x) AS _had, sum(CASE WHEN ${same.join(' AND ')} THEN 1 ELSE 0 END) AS _same`
            );
        }
        parts.push(
            `${mode} (a)-[r:${quoteName(type)}]->(b)`,
            `SET ${[...sets, relink('a', changed), relink('b', changed)].join(', ')}`,
            'RETURN count(r) AS related'
        );
        return new GraphStatement(parts.join('\n'), bindings);
    }

    /** Removes every relationship of the type from `from` to `to`. Returns how many there were. */
    static unrelate(from: MatchedNode, to: MatchedNode, type: string): GraphStatement {
        assertType(type);
        return new GraphStatement(
            [
                `MATCH ${pattern('a', from, '$_fromId')}-[r:${quoteName(type)}]->${pattern('b', to, '$_toId')}`,
                'DELETE r',
                `SET ${relink('a')}, ${relink('b')}`,
                'RETURN count(*) AS removed'
            ].join('\n'),
            { _fromId: from.id, _toId: to.id, _stamp: Stamps.fresh() }
        );
    }

    /** The nodes of `target` joined to `from` by the type in the direction, each once, as fragment rows. */
    static related(from: MatchedNode, type: string, direction: Direction, target: FragmentModel): GraphStatement {
        assertType(type);
        const edge = `[:${quoteName(type)}]`;
        const arrow =
            direction === Direction.INCOMING
                ? `<-${edge}-`
                : direction === Direction.UNDIRECTED
                ? `-${edge}-`
                : `-${edge}->`;
        return new GraphStatement(
            [
                `MATCH ${pattern('a', from, '$_fromId')}${arrow}(n${labelExpression(target.labels)})`,
                'WITH DISTINCT n',
                'RETURN {props: properties(n), labels: labels(n)} AS result'
            ].join('\n'),
            { _fromId: from.id }
        );
    }

    /** Removes every relationship of the type `from` has in the direction. Returns how many there were. */
    static unrelateAll(from: MatchedNode, type: string, direction: Direction): GraphStatement {
        assertType(type);
        const edge = `[r:${quoteName(type)}]`;
        const arrow =
            direction === Direction.INCOMING
                ? `<-${edge}-`
                : direction === Direction.UNDIRECTED
                ? `-${edge}-`
                : `-${edge}->`;
        return new GraphStatement(
            [
                `MATCH ${pattern('a', from, '$_fromId')}${arrow}(b)`,
                'DELETE r',
                `SET ${relink('a')}, ${relink('b')}`,
                'RETURN count(*) AS removed'
            ].join('\n'),
            { _fromId: from.id, _stamp: Stamps.fresh() }
        );
    }
}

function pattern(alias: string, node: MatchedNode, parameter: string): string {
    if (!node.model.nodeIdProperty) {
        throw new DrivineError(
            `${node.model.type.name} has no @NodeId property, so a node of it can't be referred to by id.`
        );
    }
    const labels = [...new Set([...node.model.labels, ...(node.labels ?? [])])];
    return `(${alias}${labelExpression(labels)} {${quoteName(node.model.nodeIdProperty)}: ${parameter}})`;
}

function assertType(type: string): void {
    if (!type?.trim()) {
        throw new DrivineError('A relationship needs a type.');
    }
}
