import { instance, mock, when } from 'ts-mockito';
import { PersistenceManagerFactory } from '@/manager/PersistenceManagerFactory';
import { TransactionContextHolder, ConnectionProvider, DatabaseRegistry } from '@liberation-data/drivine';

describe('PersistenceManagerFactory', () => {
    it('should build or return default PersistenceManager', () => {
        const registry: DatabaseRegistry = mock<DatabaseRegistry>();
        const provider: ConnectionProvider = mock<ConnectionProvider>();
        const transactionContextHolder = mock(TransactionContextHolder);
        when(registry.connectionProvider('default')).thenReturn(instance(provider));

        const factory = new PersistenceManagerFactory(instance(registry), instance(transactionContextHolder));

        const result = factory.get('default');
        expect(result).toBeDefined();
        expect(factory.managers.size).toEqual(1);

        factory.get('default');
        expect(factory.managers.size).toEqual(1);
    });
});
