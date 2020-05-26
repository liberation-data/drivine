# Quick Start

## First install Drivine

```
npm install @liberation-data/drivine
``` 

## Define a named connection

#### .env
```
NEO_DATABASE_TYPE=NEO4J
NEO_DATABASE_USER='neo4j'
NEO_DATABASE_PASSWORD='h4ckM3'
NEO_DATABASE_HOST='localhost'
NEO_DATABASE_PORT='7687'

TRAFFIC_DATABASE_TYPE=AGENS_GRAPH
TRAFFIC_DATABASE_NAME='maps'
TRAFFIC_DATABASE_USER='agens'
TRAFFIC_DATABASE_PASSWORD='h4ckMe'
TRAFFIC_DATABASE_HOST='localhost'
TRAFFIC_DATABASE_PORT='5432'
TRAFFIC_DATABASE_IDLE_TIMEOUT=500
TRAFFIC_DATABASE_DEFAULT_GRAPH_PATH=traffic
```

You can also define a default connection with no name prefix. 

## Add the Drivine Module

```typescript
@Module({
    imports: [
        DrivineModule.withOptions(<DrivineModuleOptions> {
            connectionProviders: [
                DatabaseRegistry.buildOrResolveFromEnv('NEO')
            ]
        }),
    ],
    providers: [RouteRepository],
    controllers: [RouteController],
})
export class AppModule implements NestModule {}
```

## Off To The Races!

```typescript
@Injectable()
export class RouteRepository {

    constructor(
        @InjectPersistenceManager() readonly persistenceManager: PersistenceManager,
        @InjectCypher('@/traffic/routesBetween') readonly routesBetween: Statement) {
    }

    @Transactional() // Has default Propagation.REQUIRED - so partipicate in a current txn, or start one.
    async findFastestBetween(start: string, destination: string): Promise<Route> {
        return this.persistenceManager.getOne(
            new QuerySpecification<Route>()
                .withStatement(this.routesBetween)
                .bind([start, destination])
                .limit(1)
                .transform(Route)
        );
    }
}
```

## Quickest Start

Too much work? Clone the [starter template](https://github.com/liberation-data/drivine-inspiration) and start hacking. 

This module contains a basic starter template. Also, so that you can get rolling as quickly as possible, a number a graph database koans, for typical use-cases - recommendations, social networks, etc, each presented in a Drivine style.  