import { Injectable } from '@nestjs/common';
import {
    Cursor,
    CursorSpecification,
    InjectPersistenceManager,
    PersistenceManager,
    QuerySpecification,
    Transactional
} from '@liberation-data/drivine';

@Injectable()
export class MemgraphRepository {
    constructor(@InjectPersistenceManager('MEMGRAPH') readonly persistenceManager: PersistenceManager) {}

    @Transactional()
    async createHero(name: string, powers: string[]): Promise<void> {
        await this.persistenceManager.execute(
            new QuerySpecification(`CREATE (:Hero {name: $name, powers: $powers})`).bind({ name, powers })
        );
    }

    @Transactional()
    async findHero(name: string): Promise<any> {
        return this.persistenceManager.maybeGetOne(
            new QuerySpecification(`MATCH (h:Hero) WHERE h.name = $1 RETURN h`).bind([name])
        );
    }

    @Transactional()
    async streamSeries(upTo: number): Promise<number[]> {
        const cursor: Cursor<number> = await this.persistenceManager.openCursor(
            new CursorSpecification<number>(`UNWIND range(1, toInteger($upTo)) AS n RETURN n`).bind({ upTo }).batchSize(3)
        );
        const results: number[] = [];
        for await (const n of cursor) {
            results.push(n);
        }
        return results;
    }
}
