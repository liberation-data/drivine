/**
 * Colours text for a terminal as cli-color did, byte for byte, with no Node-only library: the colour's code, the text,
 * then the code that ends a foreground colour (39). A colour the text already ends inside it is replaced by this one,
 * so the rest of the text keeps it. With the `NO_COLOR` environment variable set, the text is not wrapped, as
 * cli-color's; in a page, which has no environment, it always is.
 */
export type Color = (text?: unknown) => string;

const END = '\x1b[39m';

function noColor(): boolean {
    return typeof process !== 'undefined' && !!process.env?.NO_COLOR;
}

function color(code: number): Color {
    const start = `\x1b[${code}m`;
    return (text?: unknown) => {
        const message = (text === undefined || text === null ? '' : String(text)).split(END).join(start);
        return noColor() ? message : start + message + END;
    };
}

export const Colors = {
    green: color(32),
    red: color(31),
    magentaBright: color(95),
    cyanBright: color(96),
    redBright: color(91)
};
