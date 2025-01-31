import { QuerySpecification } from '@/query/QuerySpecification';
import { DrivineLogger } from '@/logger/DrivineLogger';

export class StatementLogger {
    private logger = new DrivineLogger(StatementLogger.name);

    constructor(readonly sessionId: string) {}

    log(query: QuerySpecification<any>, hrStart: [number, number]): void {
        const hrEnd = process.hrtime(hrStart);
        const uSec = Math.round(hrEnd[1] / 1000);
        this.logger.verbose({
            ...query,
            sessionId: this.sessionId,
            elapsed: `${uSec} µsec = ${uSec / 1000} ms`,
        });
    }
}
