import { Neo4jConnection } from '@/connection/neo4j/Neo4jConnection';
import { DrivineLogger } from '@/logger';
import { Neo4jError, Session } from 'neo4j-driver';
import { ResultMapper } from '@/mapper/ResultMapper';

// What a Neo4j session closed after a failure logs (#479, as drivine4j#473).
describe('Neo4jConnection.release', () => {
    let close: jest.Mock;
    let connection: Neo4jConnection;
    let warn: jest.SpyInstance;
    let debug: jest.SpyInstance;

    beforeEach(() => {
        close = jest.fn(async () => Promise.resolve());
        connection = new Neo4jConnection({ close } as unknown as Session, {} as ResultMapper);
        warn = jest.spyOn(DrivineLogger.prototype, 'warn').mockImplementation(() => undefined);
        debug = jest.spyOn(DrivineLogger.prototype, 'debug').mockImplementation(() => undefined);
    });
    afterEach(() => jest.restoreAllMocks());

    it('should log at debug a statement the engine turned away for another session, for its caller runs it again', async () => {
        await connection.release(
            new Neo4jError('Deadlock wait cycle.', 'Neo.TransientError.Transaction.DeadlockDetected')
        );

        expect(debug).toHaveBeenCalledTimes(1);
        expect(warn).not.toHaveBeenCalled();
        expect(close).toHaveBeenCalledTimes(1);
    });

    it('should warn of another failure', async () => {
        await connection.release(new Neo4jError('Invalid input', 'Neo.ClientError.Statement.SyntaxError'));

        expect(warn).toHaveBeenCalledTimes(1);
        expect(debug).not.toHaveBeenCalled();
        expect(close).toHaveBeenCalledTimes(1);
    });
});
