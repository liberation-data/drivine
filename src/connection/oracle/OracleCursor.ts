import { CursorSpecification } from '@/cursor/CursorSpecification';
import { ResultMapper } from '@/mapper/ResultMapper';
import { AbstractCursor } from '@/cursor/AbstractCursor';
import { ResultSet } from 'oracledb';

export class OracleCursor<T> extends AbstractCursor<T> implements AsyncIterable<T> {
    constructor(
        sessionId: string,
        spec: CursorSpecification<T>,
        private readonly resultSet: ResultSet<any>,
        private readonly resultMapper: ResultMapper
    ) {
        super(sessionId, spec);
    }

    async read(count: number): Promise<T[]> {
        const hrStart = process.hrtime();
        const rows = await this.resultSet.getRows(count);
        this.queryLogger.log(this.spec, hrStart);
        return this.resultMapper.mapQueryResults(rows, this.spec);
    }

    async close(): Promise<void> {
        await this.resultSet.close();
    }
}
