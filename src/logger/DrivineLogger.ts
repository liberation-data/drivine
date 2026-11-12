import { LogLevel } from '@/logger/LogLevel';
import { LogMessage } from '@/logger/LogMessage';

/** Where log text goes: Node's standard output, or, in a page, which has none, the console, a line a call. */
const output: { write(text: string): unknown } =
    typeof process !== 'undefined' && process.stdout
        ? process.stdout
        : {
              // eslint-disable-next-line no-console -- a page has no standard output
              write: (text: string) => console.log(text.replace(/\n$/, ''))
          };

/** The log level the environment's `DRIVINE_LOG_LEVEL` names, ERROR where none does or there is no environment. */
function configuredLevel(): string | undefined {
    return typeof process !== 'undefined' ? process.env?.DRIVINE_LOG_LEVEL : undefined;
}

export class DrivineLogger {
    private readonly enabledLevel: LogLevel;

    constructor(readonly context: string) {
        this.enabledLevel = LogLevel.from(configuredLevel());
    }

    error(message: any, trace?: string, context?: string): void {
        this.printMessage(message, LogLevel.ERROR, context || this.context);
        this.printStackTrace(trace);
    }

    fatal(message: any, error?: Error): void {
        this.error(message, error ? error.stack : new Error().stack);
    }

    log(message: any, context?: string): void {
        this.printMessage(message, LogLevel.INFO, context || this.context);
    }

    warn(message: any, context?: string): void {
        this.printMessage(message, LogLevel.WARN, context || this.context);
    }

    debug(message: any, context?: string): void {
        this.printMessage(message, LogLevel.DEBUG, context || this.context);
    }

    verbose(message: any, context?: string): void {
        this.printMessage(message, LogLevel.VERBOSE, context || this.context);
    }

    private printMessage(message: any, level: LogLevel, context: string = ''): void {
        if (level.value >= this.enabledLevel.value) {
            // TODO: LocalStorage.namespace is used here instead of injecting LocalStorage - which didn't work. Why?
            const logMessage = new LogMessage(level, new Date(), message, context);
            logMessage.write(output);
        }
    }

    private printStackTrace(trace?: string): void {
        if (!trace) {
            return;
        }
        output.write(`${trace}\n`);
    }
}
