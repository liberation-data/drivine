import { PersistenceManager } from '@/manager';
import { Injectable } from '@nestjs/common';
import { CypherStatement, QuerySpecification } from '@/query';
import { InjectCypher, InjectPersistenceManager } from '@liberation-data/drivine';

@Injectable()
export class WineRepository {
    constructor(
        @InjectPersistenceManager('WINE') readonly persistenceManager: PersistenceManager,
        @InjectCypher(__dirname, 'listProlificWineTasters') readonly moviesForActor: CypherStatement
    ) {}

    async listProlificWineTasters(): Promise<any> {
        const spec = new QuerySpecification().withStatement(this.moviesForActor);
        return this.persistenceManager.query(spec);
    }
}
