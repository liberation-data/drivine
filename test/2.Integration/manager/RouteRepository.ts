import { Injectable } from '@nestjs/common';
import { TransactionalPersistenceManager } from '@/manager/TransactionalPersistenceManager';
import { Route } from './Route';
import { Transactional } from '@/transaction/Transactional';
import { QuerySpecification } from '@/query/QuerySpecification';
import { CursorSpecification } from '@/cursor/CursorSpecification';
import { Cursor } from '@/cursor/Cursor';
import { InjectCypher } from '@/DrivineInjectionDecorators';

@Injectable()
export class RouteRepository {
    public constructor(
        public readonly persistenceManager: TransactionalPersistenceManager,
        @InjectCypher(__dirname + '/routesBetween') public readonly routesBetween: string
    ) {}

    @Transactional()
    public async findRoutesBetween(start: string, destination: string): Promise<Route[]> {
        return this.persistenceManager.query(
            new QuerySpecification<Route>()
                .withStatement(this.routesBetween)
                .bind([start, destination])
                .transform(Route)
        );
    }

    @Transactional()
    public async findFastestBetween(start: string, destination: string): Promise<Route> {
        return this.persistenceManager.getOne(
            new QuerySpecification<Route>()
                .withStatement(this.routesBetween)
                .bind([start, destination])
                .limit(1)
                .transform(Route)
        );
    }

    @Transactional()
    public async asyncRoutesBetween(start: string, destination: string): Promise<Cursor<Route>> {
        return this.persistenceManager.openCursor(
            new CursorSpecification<Route>()
                .withStatement(this.routesBetween)
                .bind([start, destination])
                .batchSize(5)
                .transform(Route)
        );
    }
}
