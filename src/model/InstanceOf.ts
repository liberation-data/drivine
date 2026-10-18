import { classChain, ownClassMetadata } from '@/annotation/Metadata';
import { labelExpression } from '@/backend/Cypher';
import { DrivineError } from '@/DrivineError';

/**
 * A predicate over `alias` (by default `n`, the node a filter is written against) that holds when the node is of the
 * fragment class: it carries all of the class's labels. For a load of a parent class that wants one subtype:
 * `gom.loadAll(Person, instanceOf(Employee))`.
 */
export function instanceOf(type: Function, alias: string = 'n'): string {
    return `${alias}${labelExpression(classLabels(type))}`;
}

/** The labels a node of the class carries: its own and those it inherits. */
export function classLabels(type: Function): string[] {
    const labels = new Set<string>();
    for (const it of classChain(type)) {
        ownClassMetadata(it)?.labels?.forEach((label) => labels.add(label));
    }
    if (!labels.size) {
        throw new DrivineError(`${type.name} has no labels, so it can't be told apart by them.`);
    }
    return [...labels];
}
