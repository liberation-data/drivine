import { CollectionSort } from '@/dsl/QueryRenderer';

/**
 * Orders the lists a query's collection terms name, in each object: the terms of one list apply in turn, each breaking
 * the ties of those before. Nulls go where Cypher puts them unless placed: last ascending, first descending.
 */
export function sortCollections(objects: any[], sorts: CollectionSort[]): void {
    const byList = new Map<string, CollectionSort[]>();
    for (const sort of sorts) {
        const key = sort.relationship.join('.');
        byList.set(key, [...(byList.get(key) ?? []), sort]);
    }
    for (const terms of byList.values()) {
        for (const object of objects) {
            listsAt(object, terms[0].relationship).forEach((list) => list.sort(comparator(terms)));
        }
    }
}

/** The lists at the end of a path of fields, through every item of a list met on the way. */
function listsAt(value: any, path: string[]): any[][] {
    if (value == null) {
        return [];
    }
    if (!path.length) {
        return Array.isArray(value) ? [value] : [];
    }
    const [head, ...rest] = path;
    const items = Array.isArray(value) ? value : [value];
    return items.flatMap((it) => listsAt(it?.[head], rest));
}

function comparator(terms: CollectionSort[]): (a: any, b: any) => number {
    return (a, b) => {
        for (const term of terms) {
            const x = term.key.reduce((it, field) => it?.[field], a);
            const y = term.key.reduce((it, field) => it?.[field], b);
            const order = compare(x, y, term);
            if (order) {
                return order;
            }
        }
        return 0;
    };
}

function compare(x: any, y: any, term: CollectionSort): number {
    const sign = term.direction === 'ASC' ? 1 : -1;
    if (x == null || y == null) {
        if (x == null && y == null) {
            return 0;
        }
        const nullsFirst = term.nulls ? term.nulls === 'FIRST' : term.direction === 'DESC';
        return (x == null) === nullsFirst ? -1 : 1;
    }
    const xv = x instanceof Date ? x.getTime() : x;
    const yv = y instanceof Date ? y.getTime() : y;
    return (xv < yv ? -1 : xv > yv ? 1 : 0) * sign;
}
