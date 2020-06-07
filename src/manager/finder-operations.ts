import { PersistenceManager } from '@/manager';
import { QuerySpecification } from '@/query';
import * as assert from 'assert';
import { DrivineError } from '@/drivine-error';

export class FinderOperations {
    constructor(readonly persistenceManager: PersistenceManager) {}

    async getOne<T>(spec: QuerySpecification<T>): Promise<T> {
        const results = await this.persistenceManager.query<T>(spec);
        assert(results.length === 1, `Expected exactly one result`);
        return results[0];
    }

    async maybeGetOne<T>(spec: QuerySpecification<T>): Promise<T | undefined> {
        const results = await this.persistenceManager.query<T>(spec);
        if (results.length === 0) {
            return undefined;
        } else if (results.length === 1) {
            return results[0];
        } else {
            throw new DrivineError(`Expected one result, received ${results.length}.`);
        }
    }
}
