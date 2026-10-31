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

/** Whether `failure`, or a cause under it, as deep as ten, is one `matches` takes. */
export function anyCause(failure: unknown, matches: (cause: any) => boolean): boolean {
    for (let cause: any = failure, depth = 0; cause && depth < 10; cause = cause.rootCause ?? cause.cause, depth++) {
        if (matches(cause)) {
            return true;
        }
    }
    return false;
}

/**
 * Whether a SQL store turned schema statements away because two sessions were each waiting on the other, so that
 * running them again may succeed. On Oracle, that is for an object's library cache lock (ORA-04020), as DDL over
 * a table that other sessions' writes hold may be, or for a row (ORA-00060); on Postgres, a deadlock (40P01). A graph's
 * first-use block runs again only for these: a lock merely busy has had its wait inside the block already (on Oracle,
 * `OracleGraph.DDL_WAIT_SECONDS`), and running it again would hold the app's first connection for that wait again each
 * time. The failure and each cause under it are looked at.
 */
export function ddlDeadlocked(failure: unknown): boolean {
    return anyCause(failure, (it) => /ORA-(00060|04020)\b/.test(it.message ?? '') || it.code === '40P01');
}

/**
 * Whether a SQL store turned schema statements away because of another session's, as sessions that make a store's
 * indexes together do, so that running them again may succeed: a deadlock (see {@link ddlDeadlocked}), or on Oracle a
 * lock that was busy (ORA-00054). The failure and each cause under it are looked at.
 */
export function ddlContended(failure: unknown): boolean {
    return ddlDeadlocked(failure) || anyCause(failure, (it) => /ORA-00054\b/.test(it.message ?? ''));
}

/**
 * Whether a SQL store refused schema statements for good, so that running them again would fail the same way: the user
 * may not make tables (ORA-01031 on Oracle, 42501 on Postgres), or the database may only be read (ORA-16000, and 25006,
 * as on a hot standby). A graph's first-use block refused so is not run again by its provider (see `FirstConnection`).
 * The failure and each cause under it are looked at. drivine4j's `JdbcConnectionProvider.cannotMake` and
 * drivine-python's `will_not_make` take the same codes.
 */
export function ddlWillNotMake(failure: unknown): boolean {
    return anyCause(failure, (it) => /ORA-(01031|16000)\b/.test(it.message ?? '') || ['42501', '25006'].includes(it.code));
}

/**
 * The failures a run of {@link whenNotContended} threw: ran out of attempts on, or would not run again. Held weakly, by
 * the failure itself, so an outer run finds it under the error that wraps it, and it goes when the failure does.
 */
const givenUp = new WeakSet();

/**
 * Whether `failure`, or a cause under it, is one a run of {@link whenNotContended} inside this one already threw, as a
 * graph's first-use block is under a schema statement or a save that asked for the first connection.
 */
function gaveUpOn(failure: unknown): boolean {
    return anyCause(failure, (it) => typeof it === 'object' && givenUp.has(it));
}

/** `failure`, marked as one a run gave up on (see {@link gaveUpOn}). */
function givingUp(failure: unknown): unknown {
    if (typeof failure === 'object' && failure) {
        givenUp.add(failure);
    }
    return failure;
}

/**
 * Runs `statement`, again after a pause when the engine turned it away because another writer held what it writes.
 * The first failure is thrown once attempts run out; a failure of another kind is thrown at once. So is one a run
 * inside `statement` already threw, having run out of attempts on it or taken it for one not to run again, so that
 * runs one inside the other don't multiply their attempts (six by six), nor run again what the inner one would not, as
 * a schema statement would the first-use block whose lock stayed busy on Oracle: each of those may wait a minute for
 * its lock (see `OracleGraph.DDL_WAIT_SECONDS`).
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
            if (gaveUpOn(failure) || !contended(failure)) {
                throw givingUp(first ?? failure);
            }
            first = first ?? failure;
            if (attempt < CONTENDED_ATTEMPTS - 1) {
                await sleep(contendedPause(attempt));
            }
        }
    }
    throw givingUp(first);
}
