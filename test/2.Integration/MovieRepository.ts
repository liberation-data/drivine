import { PersistenceManager } from '@/manager';
import { Injectable } from '@nestjs/common';
import { CypherStatement, QuerySpecification } from '@/query';
import { InjectCypher, InjectPersistenceManager } from '@liberation-data/drivine';

@Injectable()
export class MovieRepository {
    constructor(
        @InjectPersistenceManager() readonly persistenceManager: PersistenceManager,
        @InjectCypher(__dirname, 'movies') readonly testData: CypherStatement,
        @InjectCypher(__dirname, 'moviesForActor') readonly moviesForActor: CypherStatement
    ) {}

    async loadTestData(): Promise<void> {
        await this.persistenceManager.query(new QuerySpecification(this.testData));
    }

    async listMoviesForActor(name: string): Promise<any> {
        const spec = new QuerySpecification().withStatement(this.moviesForActor).bind([name]);
        return this.persistenceManager.maybeGetOne(spec);
    }
}
