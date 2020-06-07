import { LogLevel } from '@/logger';
import { LogMessage } from '@/logger';

export class DrivineLogger {
    private readonly enabledLevel: LogLevel;

    constructor(readonly context: string) {
        this.enabledLevel = LogLevel.from(process.env.DRIVINE_LOG_LEVEL);
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
            logMessage.write(process.stdout);
        }
    }

    private printStackTrace(trace?: string): void {
        if (!trace) {
            return;
        }
        process.stdout.write(trace);
        process.stdout.write(`\n`);
    }
}
