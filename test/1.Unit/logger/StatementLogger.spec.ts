import { StatementLogger } from '@/logger/StatementLogger';
import { DrivineLogger } from '@/logger/DrivineLogger';
import { QuerySpecification } from '@/query/QuerySpecification';

describe('StatementLogger', () => {
    let verbose: jest.SpyInstance;

    beforeEach(() => {
        verbose = jest.spyOn(DrivineLogger.prototype, 'verbose').mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    /** What is logged of a statement that took `millis`, timed from performance.now(). */
    function elapsedFor(millis: number): string {
        const start = 100_000;
        jest.spyOn(performance, 'now').mockReturnValue(start + millis);
        new StatementLogger('session-1').log(new QuerySpecification('RETURN 1'), start);
        return verbose.mock.calls[0][0].elapsed;
    }

    it('counts the whole seconds of a statement that takes more than a second', () => {
        expect(elapsedFor(1200)).toEqual('1200000 µsec = 1200 ms');
    });

    it('logs a statement of exactly one second as 1000 ms, not 0', () => {
        expect(elapsedFor(1000)).toEqual('1000000 µsec = 1000 ms');
    });

    it('logs a statement under a second in microseconds and milliseconds', () => {
        expect(elapsedFor(3.456789)).toEqual('3457 µsec = 3.457 ms');
    });
});
