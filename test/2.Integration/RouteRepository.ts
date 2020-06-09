import { Injectable } from '@nestjs/common';
import { Route } from './models/Route';
import { InjectPersistenceManager, PersistenceManager, InjectCypher, CypherStatement, Transactional, QuerySpecification, Cursor, CursorSpecification } from '@liberation-data/drivine';

@Injectable()
export class RouteRepository {
    constructor(
        @InjectPersistenceManager() readonly persistenceManager: PersistenceManager,
        @InjectCypher(__dirname, '/routesBetween') readonly routesBetween: CypherStatement
    ) {}
 
    @Transactional()
    async findFastestBetween(start: string, destination: string): Promise<Route> {
        return this.persistenceManager.getOne(
            new QuerySpecification<Route>()
                .withStatement(this.routesBetween)
                .bind([start, destination])
                .limit(1)
                .transform(Route)
        );
    }

    @Transactional()
    async findRoutesBetween(start: string, destination: string): Promise<Route[]> {
        return this.persistenceManager.query(
            new QuerySpecification<Route>()
                .withStatement(this.routesBetween)
                .bind([start, destination])
                .transform(Route)
        );
    }

    @Transactional()
    async asyncRoutesBetween(start: string, destination: string): Promise<Cursor<Route>> {
        return this.persistenceManager.openCursor(
            new CursorSpecification<Route>()
                .withStatement(this.routesBetween)
                .bind([start, destination])
                .batchSize(5)
                .transform(Route)
        );
    }
}
