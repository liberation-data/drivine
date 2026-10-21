import { Injectable } from '@nestjs/common';
import {
    Cursor,
    CursorSpecification,
    PersistenceManager,
    QuerySpecification,
    Transactional
} from '@liberation-data/drivine';
import { InjectPersistenceManager } from '@liberation-data/drivine/nest';

@Injectable()
export class PostgresRepository {
    constructor(@InjectPersistenceManager('POSTGRES') readonly persistenceManager: PersistenceManager) {}

    @Transactional()
    async createPeople(names: string[]): Promise<void> {
        await this.persistenceManager.execute(
            new QuerySpecification(`create table if not exists person (id serial primary key, name text not null)`)
        );
        for (const name of names) {
            await this.persistenceManager.execute(
                new QuerySpecification(`insert into person (name) values ($name)`).bind({ name })
            );
        }
    }

    @Transactional()
    async findByNames(names: string[]): Promise<string[]> {
        return this.persistenceManager.query(
            new QuerySpecification<string>(`select name from person where name = any($names) order by name`)
                .bind({ names })
                .map((it: any) => it.name)
        );
    }

    @Transactional()
    async personTableExists(): Promise<boolean> {
        const row = await this.persistenceManager.getOne<any>(
            new QuerySpecification(`select to_regclass('public.person') is not null as exists`)
        );
        return row.exists;
    }

    @Transactional()
    async streamSeries(upTo: number): Promise<number[]> {
        const cursor: Cursor<number> = await this.persistenceManager.openCursor(
            new CursorSpecification<number>(`select n from generate_series(1, $upTo) as n`)
                .bind({ upTo })
                .batchSize(3)
                .map((it: any) => it.n)
        );
        const results: number[] = [];
        for await (const n of cursor) {
            results.push(n);
        }
        return results;
    }
}
