import { Injectable } from '@nestjs/common';
import { DrivineError } from '@/DrivineError';
import { PersistenceManager } from '@/manager/PersistenceManager';
import { QuerySpecification } from '@/query/QuerySpecification';
import { ConnectionProvider } from '@/connection/ConnectionProvider';
import { InjectConnectionProvider } from '@/DrivineInjectionDecorators';

@Injectable()
export class NonTransactionalPersistenceManager implements PersistenceManager {
    public constructor(@InjectConnectionProvider() public readonly connectionProvider: ConnectionProvider) {}

    public async query<T>(spec: QuerySpecification<T>): Promise<T[]> {
        const connection = await this.connectionProvider.connect();
        try {
            return await connection.query(spec);
        } catch (e) {
            throw DrivineError.withRootCause(e, spec);
        } finally {
            await connection.release();
        }
    }
}
