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
 * A write that doesn't go through Drivine, Cypher or SQL of your own, doesn't keep the copy in step: set it with
 * `LowerCopies.setClause`, or recreate the index.
 */
export function CaseInsensitive(): PropertyDecorator {
    return (prototype: object, property: string | symbol) =>
        definePropertyMetadata(prototype, String(property), { caseInsensitive: true });
}
