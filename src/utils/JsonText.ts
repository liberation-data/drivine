/**
 * `value` as JSON, each `bigint` in it, at any depth, written as the whole number it is, with its digits, where
 * `JSON.stringify` refuses one (liberation-data/drivine#739). It writes it by `JSON.rawJSON`, which Node has from 21 and
 * current browsers have. `replacer` runs first, as JSON.stringify's would.
 */
export function jsonText(value: unknown, replacer?: (key: string, value: any) => any): string {
    return JSON.stringify(value, (key, it) => {
        const replaced = replacer ? replacer(key, it) : it;
        return typeof replaced === 'bigint' ? json.rawJSON(replaced.toString()) : replaced;
    });
}

const json = JSON as unknown as { rawJSON(text: string): unknown };
