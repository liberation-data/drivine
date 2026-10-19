import { ConnectionPropertiesFromEnv, TransactionMode } from '@/connection';

describe('ConnectionPropertiesFromEnv', () => {
    const saved = { ...process.env };

    beforeEach(() => {
        process.env.TM_TEST_DATABASE_TYPE = 'NEO4J';
        process.env.TM_TEST_DATABASE_HOST = 'localhost';
    });

    afterEach(() => {
        process.env = { ...saved };
    });

    it('should leave transactionMode undefined when not set', () => {
        expect(ConnectionPropertiesFromEnv('TM_TEST').transactionMode).toBeUndefined();
    });

    it('should read transactionMode', () => {
        process.env.TM_TEST_DATABASE_TRANSACTION_MODE = 'STRICT';
        expect(ConnectionPropertiesFromEnv('TM_TEST').transactionMode).toEqual(TransactionMode.STRICT);
    });

    it('should refuse an unknown transactionMode', () => {
        process.env.TM_TEST_DATABASE_TRANSACTION_MODE = 'LOOSE';
        expect(() => ConnectionPropertiesFromEnv('TM_TEST')).toThrow(/must be one of: WARN, STRICT/);
    });

    it('should read the graph an Oracle store works on', () => {
        expect(ConnectionPropertiesFromEnv('TM_TEST').defaultGraphPath).toBeUndefined();
        process.env.TM_TEST_DATABASE_DEFAULT_GRAPH_PATH = 'tenant_a';
        expect(ConnectionPropertiesFromEnv('TM_TEST').defaultGraphPath).toEqual('tenant_a');
    });
});
