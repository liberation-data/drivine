/**
 * Random identifiers from the Web Crypto API, which Node (since 19) and browsers both have, so code that runs in a page
 * as well as in Node needs no `crypto` module.
 */

/** `bytes` random bytes as lower-case hex, two digits a byte: as Node's `randomBytes(bytes).toString('hex')`. */
export function randomHex(bytes: number): string {
    const values = globalThis.crypto.getRandomValues(new Uint8Array(bytes));
    let hex = '';
    for (const b of values) {
        hex += b.toString(16).padStart(2, '0');
    }
    return hex;
}

/** A random version 4 UUID, in lower case with its dashes. */
export function randomUuid(): string {
    return globalThis.crypto.randomUUID();
}
