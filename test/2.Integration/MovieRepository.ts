import { PersistenceManager } from '@/manager';
import { Injectable } from '@nestjs/common';
import { CypherStatement, QuerySpecification } from '@/query';
import { InjectCypher, InjectPersistenceManager } from '@liberation-data/drivine';

@Injectable()
export class MovieRepository {
    constructor(
        @InjectPersistenceManager() readonly persistenceManager: PersistenceManager,
        @InjectPersistenceManager('REDIS_GRAPH') readonly redisManager: PersistenceManager,
        @InjectCypher(__dirname, 'movies') readonly testData: CypherStatement,
        @InjectCypher(__dirname, 'moviesForActor') readonly moviesForActor: CypherStatement
    ) {}

    async loadTestData(): Promise<void> {
        await this.persistenceManager.query(new QuerySpecification(this.testData));
    }

    async listMoviesForActor(name: string): Promise<any> {
        const spec = new QuerySpecification(this.moviesForActor).bind([name]);
        return this.persistenceManager.maybeGetOne(spec);
    }

    async listMoviesForActorRaw(name: string): Promise<any> {
        const cql = `MATCH (actor:Person {name: '${name}'})-[:ACTED_IN]->(movie) RETURN actor, movie`
        const results: any[] = await this.redisManager.query(new QuerySpecification(cql));
        return {
            actor: {
                name: results[0].actor.name,
                born: results[0].actor.born,
                movies: results.map((it: any) => {
                    return {
                        title: it.movie.title,
                        tagline: it.movie.tagline,
                        released: it.movie.released
                    }
                })
            }
        }
    }
}
