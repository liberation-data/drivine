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

    function elapsedFor(hrElapsed: [number, number]): string {
        const hrStart: [number, number] = [100, 0];
        const hrtime = jest.spyOn(process, 'hrtime').mockReturnValue(hrElapsed);
        new StatementLogger('session-1').log(new QuerySpecification('RETURN 1'), hrStart);
        expect(hrtime).toHaveBeenCalledWith(hrStart);
        return verbose.mock.calls[0][0].elapsed;
    }

    it('counts the whole seconds of a statement that takes more than a second', () => {
        expect(elapsedFor([1, 200_000_000])).toEqual('1200000 µsec = 1200 ms');
    });

    it('logs a statement of exactly one second as 1000 ms, not 0', () => {
        expect(elapsedFor([1, 0])).toEqual('1000000 µsec = 1000 ms');
    });

    it('logs a statement under a second in microseconds and milliseconds', () => {
        expect(elapsedFor([0, 3_456_789])).toEqual('3457 µsec = 3.457 ms');
    });
});
