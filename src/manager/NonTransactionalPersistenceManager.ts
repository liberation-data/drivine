import { Logger } from '@nestjs/common';
import { DrivineError } from '@/DrivineError';
import { PersistenceManager } from '@/manager/PersistenceManager';
import { QuerySpecification } from '@/query/QuerySpecification';
import { ConnectionProvider } from '@/connection/ConnectionProvider';
import { Cursor } from '@/cursor/Cursor';
import { FinderOperations } from '@/manager/FinderOperations';
import { CursorSpecification } from '@/cursor/CursorSpecification';

export class NonTransactionalPersistenceManager implements PersistenceManager {
    private logger = new Logger(NonTransactionalPersistenceManager.name);
    private finderOperations: FinderOperations;

    constructor(readonly connectionProvider: ConnectionProvider) {
        this.finderOperations = new FinderOperations(this);
    }

    async query<T>(spec: QuerySpecification<T>): Promise<T[]> {
        const connection = await this.connectionProvider.connect();
        try {
            return await connection.query(spec);
        } catch (e) {
            throw DrivineError.withRootCause(e, spec);
        } finally {
            await connection.release();
        }
    }

    async getOne<T>(spec: QuerySpecification<T>): Promise<T> {
        return await this.finderOperations.getOne(spec);
    }

    async maybeGetOne<T>(spec: QuerySpecification<T>): Promise<T | undefined> {
        return await this.finderOperations.maybeGetOne(spec);
    }

    async openCursor<T>(spec: CursorSpecification<T>): Promise<Cursor<T>> {
        this.logger.verbose(`Open consumer for ${spec}`);
        return new Promise((resolve, reject) => {
            reject(new DrivineError(`Not implemented yet, please use TransactionalPersistenceManager`));
        });
    }
}
