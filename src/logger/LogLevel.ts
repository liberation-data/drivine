import { Format } from 'cli-color';
import * as clc from 'cli-color';
import { Cacheable } from 'typescript-cacheable';
import * as assert from 'assert';

export class LogLevel {

    static VERBOSE = new LogLevel('VERBOSE', 0, 'VERBOSE', clc.cyanBright);
    static DEBUG = new LogLevel('DEBUG', 1, ' DEBUG ', clc.magentaBright);
    static INFO = new LogLevel('INFO', 2, ' INFO  ', clc.green);
    static WARN = new LogLevel('WARN', 4, ' WARN  ', clc.red);
    static ERROR = new LogLevel('ERROR', 8, ' ERROR ', clc.redBright);
    static NONE = new LogLevel('NONE', 9, '', clc.redBright);

    @Cacheable()
    public static from(name: string = 'ERROR'): LogLevel {
        assert(name, `Log level name is required`);
        const result = LogLevel[name];
        if (result) {
            return result;
        }
        throw new Error(`No LogLevel for key: ${name}`);
    }

    private constructor(
        readonly key: string,
        readonly value: number,
        readonly consoleString: string,
        readonly color: Format
    ) {}
}
