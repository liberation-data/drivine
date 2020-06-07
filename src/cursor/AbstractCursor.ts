import * as assert from 'assert';
import { Duplex, Readable } from 'stream';
import { CursorStreamOptions } from '@/cursor/CursorStreamOptions';
import { CursorSpecification } from '@/cursor/CursorSpecification';
import { StatementLogger } from '@/logger/StatementLogger';
import { Cursor } from '@/cursor/Cursor';
import { DrivineLogger } from '@/logger';

const miss = require('mississippi');

export abstract class AbstractCursor<T> implements Cursor<T> {
    protected logger = new DrivineLogger(AbstractCursor.name);
    protected currentBatch: T[] = [];
    protected currentIndex: number = 0;
    protected stream?: Readable = undefined;
    protected queryLogger: StatementLogger;

    protected constructor(protected readonly sessionId: string, protected readonly spec: CursorSpecification<T>) {
        assert(this.spec.batch > 0, `batchSize must be more than zero`);
        this.logger.verbose(`Created cursor with batchSize: ${this.spec.batch}`);
        this.queryLogger = new StatementLogger(this.sessionId);
    }

    [Symbol.asyncIterator](): AsyncIterator<T> {
        return <AsyncIterator<T>>{
            next: async () => {
                await this.readBatchIfExpired();
                const done = this.currentBatch.length <= this.currentIndex;
                const value = done ? undefined : this.currentBatch[this.currentIndex];
                this.currentIndex++;
                return <IteratorResult<T>>{
                    value: value,
                    done: done
                };
            }
        };
    }

    asStream(options?: CursorStreamOptions<T>): Readable {
        if (!this.stream) {
            this.stream = this.composeStreamWithOptions(options);
        }
        return this.stream!;
    }

    private composeStreamWithOptions(options?: CursorStreamOptions<T>): Readable {
        const readable = miss.from(
            { objectMode: true },
            async (size: number, next: Function): Promise<Function> => {
                await this.readBatchIfExpired();
                const done = this.currentBatch.length <= this.currentIndex;
                if (done) {
                    return next(null, null);
                }
                return next(null, this.currentBatch[this.currentIndex++]);
            }
        );
        return options && options.transform
            ? miss.pipeline.obj(readable, this.transformStream(options.transform))
            : readable;
    }

    private transformStream(transform: (chunk: T) => any): Duplex {
        return miss.through.obj((chunk: T, enc: string, cb: Function) => cb(null, transform(chunk)));
    }

    /**
     * Reads batchSize results into the buffer, if the currentIndex pointer extends past the current buffer. Otherwise
     * does nothing.
     */
    private async readBatchIfExpired(): Promise<void> {
        if (this.currentIndex === this.currentBatch.length) {
            this.currentBatch = await this.read(this.spec.batch);
            this.currentIndex = 0;
        }
    }

    abstract async close(): Promise<void>;

    abstract async read(count: number): Promise<T[]>;
}
