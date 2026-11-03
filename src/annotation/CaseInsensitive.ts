import { definePropertyMetadata } from '@/annotation/Metadata';

/**
 * Marks a text property of a node fragment that is looked up without regard to case: by `eqIgnoreCase` or
 * `containsIgnoreCase`, or under a uniqueness constraint that ignores case.
 *
 * Every save of the node also writes a lowercased copy of the property beside it, under `__drivine.lower.<property>`,
 * the property the field is stored under. The database lowercases it, as it lowercases what the copy is compared with,
 * so drivine4j, drivine-python and Drivine store and match the same thing. A load doesn't read the copy, and a flat
 * `@PropertyBag` never holds it.
 *
 * A `@RangeIndex({ ignoreCase: true })` or `@Unique({ ignoreCase: true })` on the field is made over the copy, and
 * ensuring it fills the copy in on the nodes saved before there was one. Once that has been done, a query compares
 * `eqIgnoreCase` and `containsIgnoreCase` on the field with the copy, which the index serves; until then it lowercases
 * the property itself, as it does for any other field.
 *
 * ```ts
 * @NodeFragment({ labels: ['Account'] })
 * class Account {
 *     @NodeId() id: string;
 *     @CaseInsensitive() @Unique({ ignoreCase: true }) email: string;
 * }
 * ```
 *
 * The object manager keeps the copy in step: `save`, `saveAll`, `create`, `update`, `patch`, `patchAll` and the save of
 * a view. Cypher you send yourself does not, on any store: Drivine runs it as written, or compiles it to SQL, and adds
 * nothing to it. Nor does SQL of your own. Such a write to the property sets the copy too, in a `SET` of its own after
 * the one that writes the property, or is followed by a `recreate` of the index that ignores case, which fills every
 * copy of the label in again:
 *
 * ```ts
 * await pm.execute(
 *     new QuerySpecification(
 *         `MATCH (a:Account {id: $id}) SET a.email = $email SET ${LowerCopies.setClause('a', 'email')}`
 *     ).bind({ id, email })
 * );
 * // or, after the writes:
 * await gom.indexes.recreate(rangeIndex('Account', 'email', { ignoreCase: true }));
 * ```
 *
 * `LowerCopies.setClause('a', 'email')` gives ``a.`__drivine.lower.email` = toLower(a.email)``.
 */
export function CaseInsensitive(): PropertyDecorator {
    return (prototype: object, property: string | symbol) =>
        definePropertyMetadata(prototype, String(property), { caseInsensitive: true });
}
