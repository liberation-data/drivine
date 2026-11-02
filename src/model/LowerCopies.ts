import { quoteName } from '@/backend/Cypher';

const PREFIX = '__drivine.lower.';

/**
 * The lowercased copy a node keeps of each `@CaseInsensitive` property, so that a case-insensitive lookup is a plain
 * comparison an index can serve. The copy of `email` is stored under `__drivine.lower.email`, beside the stamp, and is
 * the database's own lowercasing of the property: `toLower` on the graph engines, `LOWER` on Oracle, `lower` on
 * Postgres. A lookup lowercases what it is given the same way, so the copy and the value compared with it are
 * lowercased alike, and drivine4j and drivine-python store and match the same thing.
 *
 * Every Drivine write of the node sets the copy from the property as stored once the write is done, and removes it
 * where the property has no value. The copy is no part of whether a save changed the node: a save that leaves the
 * property as it was gives the node no new stamp, whether or not the copy was already there. The layout is drivine4j's.
 */
export const LowerCopies = {
    /** The prefix of the property a copy is stored under. */
    PREFIX,

    /** The property the copy of `property`, a stored name, is stored under. */
    of(property: string): string {
        return `${PREFIX}${property}`;
    },

    /**
     * The `SET` item that writes the copy of `property` on the node bound to `alias`, from what the node holds: for
     * Cypher of your own that writes a `@CaseInsensitive` property, after it has written it. Write it in a `SET` of its
     * own, after the one that writes the property: an engine may read every value of one `SET` before it writes any.
     *
     * ```ts
     * `MATCH (a:Account {id: $id}) SET a.email = $email SET ${LowerCopies.setClause('a', 'email')}`
     * ```
     */
    setClause(alias: string, property: string): string {
        return `${alias}.${quoteName(LowerCopies.of(property))} = toLower(${alias}.${quoteName(property)})`;
    },

    /**
     * The `SET` clause that writes the copy of each of `properties` on `alias`, or undefined when there are none: what a
     * save of a fragment with `@CaseInsensitive` fields adds after it has written them.
     */
    clause(alias: string, properties: readonly string[]): string | undefined {
        return properties.length
            ? `SET ${properties.map((it) => LowerCopies.setClause(alias, it)).join(', ')}`
            : undefined;
    },

    /** The clause, as a list of none or one: to spread among a statement's clauses. */
    clauses(alias: string, properties: readonly string[]): string[] {
        const clause = LowerCopies.clause(alias, properties);
        return clause ? [clause] : [];
    }
};
