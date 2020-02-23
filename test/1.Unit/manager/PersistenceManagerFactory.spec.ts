import { DatabaseRegistry } from '@/connection/DatabaseRegistry';
import { instance, mock, when } from 'ts-mockito';
import { PersistenceManagerFactory } from '@/manager/PersistenceManagerFactory';
import { ConnectionProvider } from '@/connection/ConnectionProvider';
import { TransactionContextHolder } from '@/transaction/TransactonContextHolder';

describe('PersistenceManagerFactory', () => {

    it('should build or return default PersistenceManager', () => {

        const registry: DatabaseRegistry = mock<DatabaseRegistry>();
        const provider: ConnectionProvider = mock<ConnectionProvider>();
        const transactionContextHolder = mock(TransactionContextHolder);
        when(registry.connectionProvider("default")).thenReturn(instance(provider));

        const factory = new PersistenceManagerFactory(instance(registry), instance(transactionContextHolder));

        const result = factory.buildOrResolve({type: 'TRANSACTIONAL'});
        expect(result).toBeDefined();
        expect(factory.managers.size).toEqual(1);

        factory.buildOrResolve({type: 'TRANSACTIONAL'});
        expect(factory.managers.size).toEqual(1);
    });

});
