import { PersistenceManager } from '@/manager';
import { Injectable } from '@nestjs/common';
import { CypherStatement, QuerySpecification } from '@/query';
import { InjectCypher, InjectPersistenceManager } from '@liberation-data/drivine';

@Injectable()
export class WineRepository {
    constructor(
        @InjectPersistenceManager('WINE') readonly persistenceManager: PersistenceManager,
        @InjectCypher(__dirname, 'listProlificWineTasters') readonly listProlificQuery: CypherStatement,
        @InjectCypher(__dirname, 'getTasterProfile') readonly getTasterQuery: CypherStatement
    ) {}

    async listProlificWineTasters(): Promise<any> {
        const spec = new QuerySpecification().withStatement(this.listProlificQuery);
        return this.persistenceManager.query(spec);
    }

    async getTasterProfile(name: string): Promise<any> {
        const spec = new QuerySpecification().withStatement(this.getTasterQuery).bind({ name: name });
        return this.persistenceManager.query(spec);
    }
}
