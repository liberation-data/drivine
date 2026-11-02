import { CursorSpecification } from '@/cursor/CursorSpecification';
import { ResultMapper } from '@/mapper/ResultMapper';
import { AbstractCursor } from '@/cursor/AbstractCursor';
import type { SqliteValue } from '@/connection/sqlite/SqliteDriver';

/**
 * A cursor over a SQLite statement's rows, read a batch at a time from the statement as it steps. Once the rows are
 * all read it reads no more: node:sqlite's iterator runs the statement again when asked past its end.
 */
export class SqliteCursor<T> extends AbstractCursor<T> implements AsyncIterable<T> {
    private exhausted = false;

    constructor(
        sessionId: string,
        spec: CursorSpecification<T>,
        private readonly rows: IterableIterator<Record<string, SqliteValue>>,
        private readonly read_: (row: Record<string, SqliteValue>) => any,
        private readonly resultMapper: ResultMapper
    ) {
        super(sessionId, spec);
    }

    async read(count: number): Promise<T[]> {
        this.logger.verbose(`Reading a batch of: ${count}`);
        const hrStart = process.hrtime();
        const batch: any[] = [];
        while (!this.exhausted && batch.length < count) {
            const next = this.rows.next();
            if (next.done) {
                this.exhausted = true;
                break;
            }
            batch.push(this.read_(next.value));
        }
        this.queryLogger.log(this.spec, hrStart);
        return Promise.resolve(this.resultMapper.mapQueryResults(batch, this.spec));
    }

    /** Ends the statement, once: a statement read to its end is over, and its connection may since have closed. */
    async close(): Promise<void> {
        if (!this.exhausted) {
            this.exhausted = true;
            this.rows.return?.();
        }
        return Promise.resolve();
    }
}
