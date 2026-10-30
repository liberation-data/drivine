/** How many times a statement the engine turns away is run before its first failure is thrown. */
export const CONTENDED_ATTEMPTS = 6;

/** The least pause after the first attempt that is turned away; each later one is as much longer. */
export const CONTENDED_PAUSE_MILLIS = 15;

/**
 * The pause after `attempt` is turned away: as many CONTENDED_PAUSE_MILLIS as attempts so far, and up to as much
 * again at random. Two writers turned away by each other would otherwise pause alike, run again together and collide
 * again, until both ran out of attempts.
 */
export function contendedPause(attempt: number, random: () => number = Math.random): number {
    const base = (attempt + 1) * CONTENDED_PAUSE_MILLIS;
    return base + Math.floor(random() * base);
}

/**
 * Whether a SQL store turned schema statements away because of another session's, as sessions that make a graph's
 * tables or a store's indexes together do. Then running them again may succeed. On Oracle, a lock they wanted was busy
 * (ORA-00054), or two sessions were each waiting on the other: for an object's library cache lock (ORA-04020), as DDL
 * over a table that other sessions' writes hold may be, or for a row (ORA-00060). On Postgres, it is a deadlock (40P01)
 * or a lock not had in time (55P03). The failure and each cause under it are looked at.
 */
export function ddlContended(failure: unknown): boolean {
    for (let cause: any = failure, depth = 0; cause && depth < 10; cause = cause.rootCause ?? cause.cause, depth++) {
        if (/ORA-(00054|00060|04020)\b/.test(cause.message ?? '') || ['40P01', '55P03'].includes(cause.code)) {
            return true;
        }
    }
    return false;
}

/**
 * Runs `statement`, again after a pause when the engine turned it away because another writer held what it writes.
 * The first failure is thrown once attempts run out; a failure of another kind is thrown at once.
 */
export async function whenNotContended<T>(
    statement: () => Promise<T>,
    contended: (failure: unknown) => boolean,
    sleep: (millis: number) => Promise<void> = async (millis) => new Promise((resolve) => setTimeout(resolve, millis))
): Promise<T> {
    let first: unknown;
    for (let attempt = 0; attempt < CONTENDED_ATTEMPTS; attempt++) {
        try {
            return await statement();
        } catch (failure) {
            if (!contended(failure)) {
                throw first ?? failure;
            }
            first = first ?? failure;
            if (attempt < CONTENDED_ATTEMPTS - 1) {
                await sleep(contendedPause(attempt));
            }
        }
    }
    throw first;
}
