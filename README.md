![DrivineSplash](https://liberation-data.com/images/drivine.jpg)

Drivine is a graph database client for Node.js and TypeScript. It was created with the following design goals: 

* Support multiple graph databases (simulataneously, if you wish). Currently [AgensGraph](https://bitnine.net/agensgraph/) and 
[Neo4j](https://neo4j.com/neo4j-graph-database/). 
* **Scale to hundreds and thousands of transactions per second, without compromising architectural integrity.**

---------------------------------------

With regards to the second point on scaleability, let's break that down into component facets. 

## Features

* Facilitates the use of <a href="https://github.com/liberation-data/drivine/wiki/Repositories">well understood object-oriented</a> and functional programming patterns. 
* Supports implementation of code that adheres to a single responsibility principle (SRP). [NestJS](https://nestjs.com/) will be optional, but is recommended. 
* Takes care of <a href="https://github.com/liberation-data/drivine/wiki/Connection-Manager">infrastructure concerns</a>, so that you can focus on making the most of your data. 
* <a href="https://github.com/liberation-data/drivine/wiki/Transactions">Removes boiler plate code</a>, especially the tedious and error-prone kind. 
* <a href="https://github.com/liberation-data/drivine/wiki/Cursors">Supports streaming</a>, without back-pressure. Large amounts of data can be managed in a timely and memory efficient manner. 
* Light-weight use-case specific <a href="https://github.com/liberation-data/drivine/wiki/Object-Mapping">object graph mapping (OGM)</a>.

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

TRAFFIC_DATABASE_TYPE=AGENS_GRAPH
TRAFFIC_DATABASE_NAME='maps'
TRAFFIC_DATABASE_USER='agens'
TRAFFIC_DATABASE_PASSWORD='h4ckMe'
TRAFFIC_DATABASE_HOST='localhost'
TRAFFIC_DATABASE_PORT='5432'
TRAFFIC_DATABASE_IDLE_TIMEOUT=500
TRAFFIC_DATABASE_DEFAULT_GRAPH_PATH=traffic
```

### Add the Drivine Module and Enable Declarative Transactions

```typescript
import { DrivineModule, DrivineModuleOptions } from '@liberation-data/drivine/DrivineModule';
import { ConnectionProviderRegistry } from '@liberation-data/drivine/connection/ConnectionProviderRegistry';
import {TransactionContextMiddleware} from "@liberation-data/drivine/transaction/TransactionContextMIddleware";

@Module({
    imports: [
        DrivineModule.withOptions(<DrivineModuleOptions> {
            connectionProviders: [
                ConnectionProviderRegistry.buildOrResolveFromEnv('NEO')
            ]
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

## Off To The Races!

```typescript
@Injectable()
export class RouteRepository {
    public constructor(
        public readonly persistenceManager: TransactionalPersistenceManager,
        @InjectCypher('@/traffic/routesBetween')) {
    }

    @Transactional() // Has default Propagation.REQUIRED - so partipicate in a current txn, or start one.
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

Clone the [starter template](https://github.com/liberation-data/drivine-inspiration) and start hacking. This module 
contains a basic starter template. Also, so that you can get rolling as quickly as possible, a number a graph database koans, for typical use-cases - recommendations, social networks, etc, each presented in a Drivine style.  

## Detailed Documentation

Detailed documentation (currently under construction) [is here](https://github.com/liberation-data/drivine/wiki/Drivine).

---------------------------------------

## Tutorials

New to graph databases? Read some tutorials. 

* [Rock &amp; Roll Traffic Routing, with Neo4j](https://liberation-data.com/saxeburg-series/2018/11/28/rock-n-roll-traffic-routing.html) 
* [Rock &amp; Roll Traffic Routing, with Neo4j, Chapter Two](https://liberation-data.com/saxeburg-series/2018/12/05/rock-n-roll-traffic-routing.html) 

Have a tutorial you'd like to share? [Get in touch](https://twitter.com/doctor_cerulean) with me. 

---------------------------------------

## About

Drivine was created by [Jasper Blues](https://www.linkedin.com/in/jasper-blues-7781638) (that's me), who is also 
the creator of a popular iOS library called [Typhoon](https://github.com/appsquickly/typhoon) from 
[AppsQuick.ly](https://appsquick.ly). Typhoon is included in thousands of iOS apps including Audible.com, 
AMEX, Etihad Airlines, Singapore Airlines and others, so you're in good hands. 

The ideas behind Drivine were developed: 

* While working as part of the leadership team, under <a href="https://www.linkedin.com/in/steffs/">Steffan Karagianis</a> at <a href="https://www.msts.com/en">MSTS</a>. Thanks Steff!
* While building [Vampr](https://apps.apple.com/us/app/vampr/id1069819177) for <a href="https://www.linkedin.com/in/simonsjosh/">Josh Simons</a> and <a href="https://www.linkedin.com/in/baz-palmer-5052a325/">Baz Palmer</a>. Vampr is a social network for musicians and music lovers. It serves hundreds/thousands of transactions per second. 
* Through encouragement, advice, collaboration and debate, as well as listening to shared and individual experiences with members of the graph database community. On the encouragement and advice front, especially from <a href="https://twitter.com/mesirii?ref_src=twsrc%5Egoogle%7Ctwcamp%5Eserp%7Ctwgr%5Eauthor">Michael Hunger</a>, <a href="https://www.linkedin.com/in/joshua-bae-3775a423/">Joshua Bae</a> and past colleagues at <a href="https://twitter.com/graph_aware">GraphAware</a>. 
* Through experience as a past committer to the [Spring Framework](https://spring.io/) including on [Spring Data Neo4j](https://spring.io/projects/spring-data-neo4j). 

## License

Copyright (c) 2019 Liberation Data

Drivine is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License
as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied
warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
You should have received a copy of the GNU General Public License along with this program.
If not, see <http://www.gnu.org/licenses/>.
 
