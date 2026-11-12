import { QuerySpecification } from '@/query/QuerySpecification';
import { DrivineLogger } from '@/logger/DrivineLogger';
import { microsecondsSince } from '@/utils/Timing';

export class StatementLogger {
    private logger = new DrivineLogger(StatementLogger.name);

    constructor(readonly sessionId: string) {}

    /** Logs `query`, with the time since `hrStart`, a moment from timerStart. */
    log(query: QuerySpecification<any>, hrStart: number): void {
        const uSec = microsecondsSince(hrStart);
        this.logger.verbose({
            ...query,
            sessionId: this.sessionId,
            elapsed: `${uSec} µsec = ${uSec / 1000} ms`
        });
    }
}
