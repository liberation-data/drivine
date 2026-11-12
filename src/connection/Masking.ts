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

/** `properties` as they are printed: each of them, the password masked. */
export function printable(properties: Record<string, unknown>): Record<string, unknown> {
    return 'password' in properties
        ? { ...properties, password: maskedPassword(properties.password) }
        : { ...properties };
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
