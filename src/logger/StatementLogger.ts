import { Logger } from '@nestjs/common';
import { QuerySpecification } from '@/query/QuerySpecification';

export class StatementLogger {
    private logger = new Logger(StatementLogger.name);

    public constructor(public readonly sessionId: string) {}

    public log(query: QuerySpecification<any>, hrStart: [number, number]): void {
        const hrEnd = process.hrtime(hrStart);
        const uSec = Math.round(hrEnd[1] / 1000);
        this.logger.verbose({
            ...query,
            sessionId: this.sessionId,
            elapsed: `${uSec} µsec`
        });
    }
}
