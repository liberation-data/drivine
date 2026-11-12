import * as clc from 'cli-color';
import { Colors } from '@/logger/Colors';
import { LogLevel } from '@/logger/LogLevel';
import { LogMessage } from '@/logger/LogMessage';

// Bytes cli-color gave, which Drivine's log output kept when it stopped using it.
describe('Colors', () => {
    const saved = process.env.NO_COLOR;
    afterEach(() => {
        if (saved === undefined) {
            delete process.env.NO_COLOR;
        } else {
            process.env.NO_COLOR = saved;
        }
    });

    it('wraps text in the colour and the end of a foreground colour', () => {
        delete process.env.NO_COLOR;
        expect(Colors.green('x')).toBe('\x1b[32mx\x1b[39m');
        expect(Colors.red('x')).toBe('\x1b[31mx\x1b[39m');
        expect(Colors.magentaBright('x')).toBe('\x1b[95mx\x1b[39m');
        expect(Colors.cyanBright('x')).toBe('\x1b[96mx\x1b[39m');
        expect(Colors.redBright('x')).toBe('\x1b[91mx\x1b[39m');
    });

    it('carries its colour past one the text ends inside it', () => {
        delete process.env.NO_COLOR;
        expect(Colors.red(`a${Colors.green('b')}c`)).toBe('\x1b[31ma\x1b[32mb\x1b[31mc\x1b[39m');
    });

    it('writes nothing for undefined and null, and a number as its digits', () => {
        delete process.env.NO_COLOR;
        expect(Colors.green(undefined)).toBe('\x1b[32m\x1b[39m');
        expect(Colors.green(null)).toBe('\x1b[32m\x1b[39m');
        expect(Colors.green(5)).toBe('\x1b[32m5\x1b[39m');
    });

    it('leaves text unwrapped where NO_COLOR is set', () => {
        process.env.NO_COLOR = '1';
        expect(Colors.green('x')).toBe('x');
    });

    it('gives a log line as cli-color did', () => {
        delete process.env.NO_COLOR;
        const time = new Date('2026-11-12T00:00:00Z');
        for (const [level, colour] of [
            [LogLevel.WARN, clc.red],
            [LogLevel.DEBUG, clc.magentaBright]
        ] as const) {
            for (const message of ['text', { a: [1, 'b'] }]) {
                const text =
                    typeof message === 'object' ? colour(JSON.stringify(message, undefined, 2)) : colour(message);
                const expected =
                    colour(`[${level.consoleString}] [${time.toISOString()}] `) +
                    colour('[Ctx] ') +
                    colour(`${text}\n`);
                expect(new LogMessage(level, time, message, 'Ctx').toConsole()).toBe(expected);
            }
        }
    });
});
