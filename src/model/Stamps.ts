import { randomBytes } from 'crypto';

const QUOTED = '`__drivine.stamp`';
const TOKEN = 16;
/** A new token, made by the engine. */
const ENGINE_TOKEN = `left(replace(randomUUID(), '-', ''), ${TOKEN})`;

/**
 * A node's stamp: two random tokens of 64 bits, `<data>:<links>`, stored under `__drivine.stamp`.
 *
 * The data token speaks for the node's own properties and labels, the links token for its relationships, of every
 * type and in both directions. To mark a node is to replace one of its tokens. The format is drivine4j's, so a store
 * written from the JVM and from Node is checked alike.
 */
export const Stamps = {
    PROPERTY: '__drivine.stamp',
    TOKEN,
    /** What a node with no stamp is found to carry. */
    NEVER_STAMPED: '-',

    fresh(): string {
        return `${randomBytes(8).toString('hex')}:${randomBytes(8).toString('hex')}`;
    },

    dataToken(stamp: string): string {
        return stamp.split(':')[0];
    },

    linksToken(stamp: string): string | undefined {
        const index = stamp.indexOf(':');
        return index >= 0 && index < stamp.length - 1 ? stamp.slice(index + 1) : undefined;
    },

    /**
     * The stamp an object is handed back after a save. Each token is the node's new one only if what it speaks for was
     * as the object's stamp said when the save began; otherwise the object keeps the token it had, and a save that
     * compares it is refused until the object is loaded again.
     *
     * @param carried the stamp the object carried, or undefined
     * @param found what the node carried before the save: '' when the save made it, '-' when it had no stamp
     * @param now what the node carries after the save
     */
    handedBack(carried: string | undefined, found: string, now: string): string {
        if (carried == null) {
            // A node the save made is the object's whole. Of one that was there, the object's lists didn't come from
            // the store, so it is handed the data token alone.
            return found === '' ? now : `${Stamps.dataToken(now)}:`;
        }
        if (carried === found) {
            return now;
        }
        const data =
            Stamps.dataToken(carried) === Stamps.dataToken(found) ? Stamps.dataToken(now) : Stamps.dataToken(carried);
        const links =
            Stamps.linksToken(carried) === Stamps.linksToken(found)
                ? Stamps.linksToken(now)
                : Stamps.linksToken(carried);
        return `${data}:${links ?? ''}`;
    },

    /** The node's stamp, in Cypher, if it is two tokens, as every save leaves it; null otherwise, which counts as none. */
    twoTokensOf(alias: string): string {
        return `CASE WHEN size(${alias}.${QUOTED}) = ${
            2 * TOKEN + 1
        } AND substring(${alias}.${QUOTED}, ${TOKEN}, 1) = ':' THEN ${alias}.${QUOTED} ELSE null END`;
    },

    /**
     * The Cypher `SET` item that marks the node bound to `alias` as changed, for Cypher of your own that changes its
     * properties or labels: `MATCH (p:Person {id: $id}) SET p.name = $name, ${Stamps.setClause('p')}`. It replaces the
     * token that speaks for the node's data and keeps the one for its relationships. A node with no stamp is given one.
     */
    setClause(alias: string): string {
        return `${alias}.${QUOTED} = ${ENGINE_TOKEN} + ':' + coalesce(right(${Stamps.twoTokensOf(
            alias
        )}, ${TOKEN}), ${ENGINE_TOKEN})`;
    },

    /**
     * The Cypher `SET` item that marks the relationships of the node bound to `alias` as changed, for Cypher of your own
     * that adds or removes a relationship, or changes one's properties. Use it for both ends. It replaces the token
     * that speaks for the node's relationships and keeps the one for its data. A node with no stamp is given one.
     */
    linksClause(alias: string): string {
        return `${alias}.${QUOTED} = coalesce(left(${Stamps.twoTokensOf(
            alias
        )}, ${TOKEN}), ${ENGINE_TOKEN}) + ':' + ${ENGINE_TOKEN}`;
    }
};
