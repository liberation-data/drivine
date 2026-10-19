import { definePropertyMetadata } from '@/annotation/Metadata';

/**
 * Maps a field holding strings (an array or a Set) to the node's labels beyond its fragment's own: loaded from the
 * labels, and written as labels on save. One to a fragment.
 *
 * With `members` (a string enum, or a list of names) the set is closed: the field reads only those labels and owns
 * only them. Without, it is open: it reads every label besides the fragment's own, and owns the labels it has written,
 * which it records on the node under `__drivine.labels.<field>`.
 *
 * A save adds the field's labels. Under NullPolicy.CLEAR it also removes the labels the field owns and no longer holds;
 * under IGNORE, the default, it leaves them. A label the field doesn't own is never removed.
 */
export function NodeLabels(members?: Record<string, string | number> | string[]): PropertyDecorator {
    const names = members === undefined ? undefined : Array.isArray(members) ? members : Object.values(members);
    return (prototype: object, property: string | symbol) =>
        definePropertyMetadata(prototype, String(property), {
            nodeLabels: { members: names?.filter((it): it is string => typeof it === 'string') }
        });
}
