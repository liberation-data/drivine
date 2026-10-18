import { Stamps } from '@/model/Stamps';

/** The stamp property, quoted: its name holds a dot. */
export const STAMP = '`__drivine.stamp`';
/** Set and removed within a checked save, to take the node's write lock before its stamp is compared. */
export const LOCK = '`__drivine.lock`';
/** Set and removed within a save, to tell a node the save made from one it found. */
export const MADE = '`__drivine.made`';
/** The parameter holding the stamp a save offers the nodes it marks. */
export const OFFERED = '$_stamp';
/** The parameter holding the stamp a checked save expects the root to carry. */
export const EXPECTED = '$_expected';

const T = Stamps.TOKEN;

/** The node's stamp if it is two tokens, as every save leaves it; null otherwise, which counts as none. */
export function twoTokensOf(alias: string): string {
    return `CASE WHEN size(${alias}.${STAMP}) = ${2 * T + 1} AND substring(${alias}.${STAMP}, ${T}, 1) = ':' THEN ${alias}.${STAMP} ELSE null END`;
}

/** Whether writing `props` (a map expression) would change a property of the entity `alias`. */
export function changes(alias: string, props: string): string {
    return `any(k IN keys(${props}) WHERE ${alias}[k] IS NULL OR ${alias}[k] <> ${props}[k])`;
}

/** Replaces the node's data token when `condition` holds, or gives it a whole stamp when it has none. */
export function restamp(alias: string, condition: string): string {
    return (
        `${alias}.${STAMP} = CASE WHEN (${condition}) OR ${twoTokensOf(alias)} IS NULL ` +
        `THEN left(${OFFERED}, ${T}) + coalesce(right(${twoTokensOf(alias)}, ${T + 1}), right(${OFFERED}, ${T + 1})) ` +
        `ELSE ${alias}.${STAMP} END`
    );
}

/** Replaces the node's links token when `condition` holds, or gives it a whole stamp when it has none. */
export function relink(alias: string, condition: string = 'true'): string {
    return (
        `${alias}.${STAMP} = CASE WHEN (${condition}) OR ${twoTokensOf(alias)} IS NULL ` +
        `THEN coalesce(left(${twoTokensOf(alias)}, ${T + 1}), left(${OFFERED}, ${T + 1})) + right(${OFFERED}, ${T}) ` +
        `ELSE ${alias}.${STAMP} END`
    );
}
