![Typhoon](http://liberation-data.com/images/drivine.jpg)

Drivine is a graph database client for Node.js and TypeScript. It was created with the following design goals: 

* Support multiple graph databases. Currently [AgensGraph](https://bitnine.net/agensgraph/) and 
[Neo4j](https://neo4j.com/neo4j-graph-database/). 
* Scale to hundreds and thousands of transactions per second, without compromising architectural integrity.

## Features

* Declarative Transaction Management
* CYPHER-backed repositories
* Streaming without back-pressure. Cursor<T> implements Node's `AsyncIterable` to pull on demand and can also pose as a 
`Readable` stream. 
* Light-weight use-case specific object mapping. (More about this in the detailed docs). 

## Quick Start

```
npm install @liberation-data/drivine
``` 

# Define a Named (or default) Connection

#### .env
```
NEO_DATABASE_TYPE=NEO4J
NEO_DATABASE_USER='neo4j'
NEO_DATABASE_PASSWORD='h4ckM3'
NEO_DATABASE_HOST='localhost'
NEO_DATABASE_PORT='7687'
```

### Add the Drivine Module and Enable Declarative Transactions

```typescript
import { DrivineModule, DrivineModuleOptions } from '@liberation-data/drivine/DrivineModule';
import { ConnectionProviderRegistry } from '@liberation-data/drivine/connection/ConnectionProviderRegistry';
import {TransactionContextMiddleware} from "@liberation-data/drivine/transaction/TransactionContextMIddleware";

@Module({
    imports: [
        DrivineModule.withOptions(<DrivineModuleOptions>{
            connectionProviders: [ConnectionProviderRegistry.buildOrResolveFromEnv('NEO')]
        }),
    ],
    providers: [RouteRepository],
    controllers: [RouteController],
})
export class AppModule implements NestModule {

    public configure(consumer: MiddlewareConsumer): any {
        consumer.apply(TransactionContextMiddleware).forRoutes('**/**');
    }
}
```

```typescript
@Injectable()
export class RouteRepository {
    public constructor(
        public readonly persistenceManager: TransactionalPersistenceManager,
        @InjectCypher('@/traffic/routesBetween')) {
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
}
```

## Even Quicker Start 

Clone the [start template](https://github.com/liberation-data/drivine-inspiration) and start hacking. This module 
contains a basic starter app, well as (coming soon) a number a graph database koans, adapted for Drivine, so you can  
get rolling as quickly as possible.  

## Detailed Documentation

Will be added in the following days.

## About

Drivine was created by [Jasper Blues](https://www.linkedin.com/in/jasper-blues-7781638), who is  the creator of a 
popular iOS library called [Typhoon](https://github.com/appsquickly/typhoon) from [AppsQuick.ly](https://appsquick.ly). 

Drivine is sponsored by [Liberation Data](https://liberation-data.com).   

## License

Copyright (c) 2019 Liberation Data

Drivine is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License
as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied
warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
You should have received a copy of the GNU General Public License along with this program.
If not, see <http://www.gnu.org/licenses/>.
 
