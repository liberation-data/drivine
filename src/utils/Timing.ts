/** A moment to time a statement from, in milliseconds: `performance.now()`, which Node and browsers both have. */
export function timerStart(): number {
    return performance.now();
}

/** The whole microseconds since `start`, a moment from timerStart. */
export function microsecondsSince(start: number): number {
    return Math.round((performance.now() - start) * 1000);
}
