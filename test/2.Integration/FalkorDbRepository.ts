import { Injectable } from '@nestjs/common';
import { Cursor, CursorSpecification, PersistenceManager, QuerySpecification, Transactional } from '@liberation-data/drivine';
import { InjectPersistenceManager } from '@liberation-data/drivine/nest';

@Injectable()
export class FalkorDbRepository {
    constructor(
        @InjectPersistenceManager('FALKORDB') readonly persistenceManager: PersistenceManager,
        @InjectPersistenceManager('FALKORDB_STRICT') readonly strictPersistenceManager: PersistenceManager
    ) {}

    @Transactional()
    async clear(): Promise<void> {
        await this.persistenceManager.execute(new QuerySpecification(`MATCH (n:FalkorHero) DETACH DELETE n`));
    }

    @Transactional()
    async createHero(name: string, powers: string[], joined: Date): Promise<void> {
        await this.persistenceManager.execute(
            new QuerySpecification(`CREATE (:FalkorHero {name: $name, powers: $powers, joined: $joined})`).bind({
                name,
                powers,
                joined
            })
        );
    }

    @Transactional()
    async findHero(name: string): Promise<any> {
        return this.persistenceManager.maybeGetOne(
            new QuerySpecification(`MATCH (h:FalkorHero) WHERE h.name = $1 RETURN h`).bind([name])
        );
    }

    @Transactional()
    async heroNamesJoinedAfter(after: Date): Promise<string[]> {
        return this.persistenceManager.query(
            new QuerySpecification<string>(`MATCH (h:FalkorHero) WHERE h.joined > $after RETURN h.name ORDER BY h.name`).bind(
                { after }
            )
        );
    }

    @Transactional()
    async echo(value: any): Promise<any> {
        return this.persistenceManager.getOne(new QuerySpecification(`RETURN $value`).bind({ value }));
    }

    @Transactional()
    async epoch(): Promise<Date> {
        return this.persistenceManager.getOne(new QuerySpecification(`RETURN localdatetime('2040-01-01T10:00:00')`));
    }

    @Transactional()
    async streamSeries(upTo: number): Promise<number[]> {
        const cursor: Cursor<number> = await this.persistenceManager.openCursor(
            new CursorSpecification<number>(`UNWIND range(1, $upTo) AS n RETURN n`).bind({ upTo }).batchSize(3)
        );
        const results: number[] = [];
        for await (const n of cursor) {
            results.push(n);
        }
        return results;
    }

    @Transactional()
    async createHeroThenFail(name: string): Promise<void> {
        await this.createHero(name, [], new Date());
        throw new Error('Something went wrong after the write');
    }

    @Transactional()
    async countHeroesStrict(): Promise<number> {
        return this.strictPersistenceManager.getOne(new QuerySpecification(`MATCH (h:FalkorHero) RETURN count(h)`));
    }
}
