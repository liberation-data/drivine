import { LogLevel } from '@/logger/LogLevel';
import { Writable } from 'stream';
import * as SourceMapSupport from 'source-map-support';

SourceMapSupport.install({
    environment: 'node'
});

export class LogMessage {
    constructor(readonly level: LogLevel, readonly time: Date, readonly message: any, readonly context?: string) {}

    write(stream: Writable): void {
        stream.write(this.toConsole());
    }

    toConsole(): string {
        let messageText;
        if (typeof this.message === 'object' && this.message !== null) {
            messageText = this.level.color(JSON.stringify(this.message, undefined, 2));
        } else {
            messageText = this.level.color(this.message);
        }

        let text = this.level.color(`[${this.level.consoleString}] [${this.time.toISOString()}] `);

        if (this.context) {
            text += this.level.color(`[${this.context}] `);
        }
        text += this.level.color(`${messageText}\n`);
        return text;
    }
}
