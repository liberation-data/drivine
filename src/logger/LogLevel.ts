import { Color, Colors } from '@/logger/Colors';
import { assert } from '@/utils/Assert';

export class LogLevel {
    static VERBOSE = new LogLevel('VERBOSE', 0, 'VERBOSE', Colors.cyanBright);
    static DEBUG = new LogLevel('DEBUG', 1, ' DEBUG ', Colors.magentaBright);
    static INFO = new LogLevel('INFO', 2, ' INFO  ', Colors.green);
    static WARN = new LogLevel('WARN', 4, ' WARN  ', Colors.red);
    static ERROR = new LogLevel('ERROR', 8, ' ERROR ', Colors.redBright);
    static NONE = new LogLevel('NONE', 9, '', Colors.redBright);

    static from(name: string = 'ERROR'): LogLevel {
        assert(name, `Log level name is required`);
        const result = (LogLevel as unknown as Record<string, LogLevel | undefined>)[name];
        if (result) {
            return result;
        }
        throw new Error(`No LogLevel for key: ${name}`);
    }

    private constructor(
        readonly key: string,
        readonly value: number,
        readonly consoleString: string,
        readonly color: Color
    ) {}
}
