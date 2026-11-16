import type { SqliteDatabase, SqliteValue } from '@/connection/sqlite/SqliteDriver';
import { base64, cypherCompilerModule } from '@/cypher/SharedCypherCompiler';

/**
 * The SQLite host functions compiled Cypher calls that the shared compiler implements itself, by SQL name and number of
 * arguments (-1, as many as its operation takes): the module's `HostFunctions.all`, which its package lists by
 * `hostFunctions()`. Each reads only its arguments. Listed here, not read from the package, so a connection registers
 * them without loading it: an application that opens a SQLite store and runs no compiled Cypher never does. A unit test
 * pins this list to the package's.
 */
export const SQLITE_HOST_FUNCTIONS: Readonly<Record<string, number>> = {
    drivine_float_text: 1,
    drivine_equal: 2,
    drivine_add: 2,
    drivine_canonical: 1,
    drivine_sort_key: 1,
    drivine_list_order: 2,
    drivine_round: 3,
    regexp: 2,
    drivine_regex_group: 3,
    drivine_regexp_replace: 3,
    drivine_temporal: -1,
    drivine_temporal_arithmetic: 3,
    drivine_trunc: 1,
    drivine_to_char: 2,
    drivine_host_version: 0
};

/**
 * Registers on `db` each of the module's host functions ({@link SQLITE_HOST_FUNCTIONS}) as a call of the package's
 * `hostCall` (liberation-data/drivine#757), so compiled SQL runs the module's one copy of each, as drivine4j registers
 * the module's functions and Python loads its native extension. A whole number is given to one as a bigint, so it
 * tells `2` from `2.0`, and one it gives back is a bigint, which SQLite holds as an integer. Where a function fails its
 * statement, the call throws its message.
 *
 * Each is registered with `varargs`, as node:sqlite otherwise counts a function's arguments by its JavaScript
 * parameters: `hostCall` refuses a call of the wrong number by name.
 */
export function registerHostFunctions(db: SqliteDatabase): void {
    for (const name of Object.keys(SQLITE_HOST_FUNCTIONS)) {
        db.function(name, { deterministic: true, varargs: true, useBigIntArguments: true }, (...args) => {
            let request = '';
            for (const arg of args) {
                request += written(arg);
            }
            return answered(cypherCompilerModule().hostCall(name, request));
        });
    }
}

/** `text` as an argument of the kind `kind`: its kind, its length in UTF-16 units as JavaScript counts, a colon, itself. */
function item(kind: string, text: string): string {
    return kind + text.length + ':' + text;
}

/** An argument as `hostCall` reads one, typed as SQLite handed it over. */
export function written(value: SqliteValue): string {
    if (value === null || value === undefined) {
        return 'n';
    }
    if (typeof value === 'bigint') {
        return item('i', value.toString());
    }
    if (typeof value === 'number') {
        // `String` writes -0 as `0`: the sign is kept, as a float's.
        return item('r', Object.is(value, -0) ? '-0' : String(value));
    }
    if (typeof value === 'string') {
        return item('t', value);
    }
    return item('b', base64(value));
}

/** A `hostCall` answer as SQLite takes the value, or thrown where the function fails its statement. */
export function answered(answer: string): SqliteValue {
    const rest = answer.substring(1);
    switch (answer[0]) {
        case 'n':
            return null;
        case 'i':
            return BigInt(rest);
        case 'r':
            // Java's text of a double (`1.0E21`, `NaN`, `Infinity`), which Number reads as the same double.
            return Number(rest);
        case 't':
            return rest;
        case 'b':
            return bytes(rest);
        default:
            throw new Error(rest);
    }
}

/** `text`, base64, as bytes, by `atob`, which Node and a page both have: a page has no `Buffer`. */
function bytes(text: string): Uint8Array {
    const binary = atob(text);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        out[i] = binary.charCodeAt(i);
    }
    return out;
}
