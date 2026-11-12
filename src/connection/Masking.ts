/**
 * Keeps a password out of what Drivine's objects print: `util.inspect` (and so `console.log`), `JSON.stringify` and
 * `toString` give it as `***`, or null where there is none, as drivine4j's `ConnectionProperties.toString` does
 * (liberation-data/drivine#730). The value itself is kept, so the object still connects with it, and a copy made by
 * spreading it holds it too, without the masking: that copy is the application's own to print.
 */

/** Node's hook for what `util.inspect` prints of an object. A symbol of the registry, so no `util` is imported. */
export const INSPECT = Symbol.for('nodejs.util.inspect.custom');

/** A password as it is printed: `***`, or null where there is none. */
export function maskedPassword(password: unknown): string | null {
    return password === undefined || password === null || password === '' ? null : '***';
}

/**
 * A connection URL as it is printed: the password in it, as in `postgres://user:secret@host/db` or `?password=secret`
 * (which pg reads too), given as `***`. The password runs to the last `@` before the query, so an `@` in it is masked
 * too, and one in the query (`?application_name=me@host`) isn't taken for the end of a password.
 */
export function maskedUrl(url: string): string {
    return url.replace(/^([a-z][\w+.-]*:\/\/[^:@/]*:)[^?#]*@/i, '$1***@').replace(/([?&]password=)[^&#]*/gi, '$1***');
}

/**
 * `properties` as they are printed: each of them, the password masked, in a connection string too, and Postgres' ssl
 * key, passphrase and pfx.
 */
export function printable(properties: Record<string, unknown>): Record<string, unknown> {
    const printed = { ...properties };
    if ('password' in printed) {
        printed.password = maskedPassword(printed.password);
    }
    if (typeof printed.connectionString === 'string') {
        printed.connectionString = maskedUrl(printed.connectionString);
    }
    if (typeof printed.ssl === 'object' && printed.ssl !== null) {
        // Postgres' TLS options: its key, the key's passphrase and a PFX bundle are secrets as the password is. Read
        // with `in`, as pg makes the key it is given unenumerable.
        const given = printed.ssl as Record<string, unknown>;
        const ssl: Record<string, unknown> = { ...given };
        for (const key of ['key', 'passphrase', 'pfx'].filter((it) => it in given)) {
            ssl[key] = maskedPassword(given[key]);
        }
        printed.ssl = ssl;
    }
    return printed;
}

/**
 * Gives `properties` a `toJSON`, a `toString` and an inspect that print them with the password masked, none of them
 * enumerable, so the properties are read, spread and passed on as they were. Returns the same object.
 */
export function maskedProperties<T extends object>(properties: T): T {
    const print = (): Record<string, unknown> => printable(properties as Record<string, unknown>);
    for (const [key, value] of [
        ['toJSON', print],
        ['toString', () => JSON.stringify(print())],
        [INSPECT, print]
    ] as const) {
        Object.defineProperty(properties, key, { value, enumerable: false, configurable: true, writable: true });
    }
    return properties;
}
