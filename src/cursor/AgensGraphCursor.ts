import { CursorSpecification } from '@/cursor/CursorSpecification';
import { ResultMapper } from '@/mapper/ResultMapper';
import { Cursor } from '@/cursor/Cursor';

export class AgensGraphCursor<T> extends Cursor<T> implements AsyncIterable<T> {
    constructor(
        sessionId: string,
        spec: CursorSpecification<T>,
        private readonly pgCursor: any,
        private readonly resultMapper: ResultMapper
    ) {
        super(sessionId, spec);
    }

    async read(count: number): Promise<T[]> {
        this.logger.verbose(`Reading a batch of: ${count}`);
        return new Promise((resolve, reject) => {
            const hrStart = process.hrtime();
            this.pgCursor.read(count, (err: Error, results: any[]) => {
                this.queryLogger.log(this.spec, hrStart);
                if (err) {
                    reject(err);
                } else {
                    resolve(this.resultMapper.mapQueryResults(results, this.spec));
                }
            });
        });
    }

    async close(): Promise<void> {
        return new Promise(resolve => {
            this.pgCursor.close(() => {
                resolve();
            });
        });
    }
}
