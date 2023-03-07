<a href="https://liberation-data.github.io/drivine/"> ![DrivineSplash](https://raw.githubusercontent.com/liberation-data/drivine/master/docs/images/splash.jpg)</a>
# <a href="https://liberation-data.github.io/drivine/">drivine</a> 

⚠️ **Drivine website has moved: <a href="https://liberation-data.github.io/drivine/">here</a>.**
_Please report any broken links. Even better, a PR is very welcome! 🙏_

Drivine is a graph database client for Node.js and TypeScript. It was created with the following design goals: 

* Support multiple graph databases (simultaneously, if you wish). Currently [AgensGraph](https://bitnine.net/agensgraph/) and 
[Neo4j](https://neo4j.com/neo4j-graph-database/) (or other BOLT compatible graph DBs). 
* **Scale to hundreds and thousands of transactions per second, without compromising architectural integrity.**

---------------------------------------

With regards to the second point on scaleability, let's break that down into component facets. 

## Features

* Facilitates the use of <a href="https://drivine.org/guide/#/repositories">well understood object-oriented</a> and functional programming patterns. 
* Supports implementation of code that adheres to a single responsibility principle (SRP). [NestJS](https://nestjs.com/) will be optional, but is recommended. 
* Takes care of <a href="https://drivine.org/guide/#/persistence-manager">infrastructure concerns</a>, so that you can focus on making the most of your data. 
* <a href="https://drivine.org/guide/#/transactions">Removes boiler plate code</a>, especially the tedious and error-prone kind. 
* <a href="https://drivine.org/guide/#/cursors">Supports streaming</a>, without back-pressure. Large amounts of data can be managed in a timely and memory efficient manner. 
* Light-weight _use-case specific_ <a href="https://drivine.org/guide/#/object-mapping">object graph mapping (OGM)</a>. Drivine is NOT an OGM in the traditinoal sense. It is inspired by GraphAware CTO <a href="https://github.com/ikwattro/">Christophe Willemsen's</a> comment that "If you want to be successful at scale with your graph-powered application, then probably don't use an OGM." Instead, with Drivine, your CPYHER queries are king, and each can be performance profiled. The results are then mapped to/from a use-case specific model object. 

----

## Quick Start

Follow the **<a href="https://drivine.org/guide/#/quick-start">Quick Start</a>** section in our **<a href="https://drivine.org/guide/#/quick-start">User Guide</a>** or clone the **<a href="https://github.com/liberation-data/drivine-inspiration">sample app</a>** and use it as a starter template. 


Start creating repositories like the one below. 
```typescript
@Injectable()
export class RouteRepository {
    constructor(
        @InjectPersistenceManager() readonly persistenceManager: PersistenceManager,
        @InjectCypher('@/traffic/routesBetween') readonly routesBetween: CypherStatement) {
    }

    @Transactional() // Has default Propagation.REQUIRED - partipicate in a current txn, or start one.
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

----

## Example Applications

If you use `Drivine` and your code is public, feel free to make [PR](https://github.com/liberation-data/drivine/pulls) and add yourself to the list.

### Quick Start Template

Clone the official **[sample app](https://github.com/liberation-data/drivine-inspiration)** and start hacking. 

Repository: [github.com/liberation-data/drivine-inspiration](https://github.com/liberation-data/drivine-inspiration) 

This sample is a basic starter template, with some tutorials. It has some endpoints for traffic routing, movies/films and other typical use-cases. Rather than start from scratch, choose the one that closely matches yours, and modify. 

### SlackMap

New version of [slackmap.com](https://slackmap.com) is full rewrite with technology update.
The `OrientDB` was replaced with `Neo4j` and we choose `Drivine` as the way to work with the database.

Check out how `Drivine` supports `Neo4j` in `Full Stack JavaScript App` using `Angular` + `Nest` + `Nx Workspace Monorepo`.

Repository: [github.com/SlackMap/slackmap](https://github.com/SlackMap/slackmap) 

* **master** branch - not released yet
* **develop** branch - has all the current work

----

## Documentation

Best way to learn Drivine is with our [User Guide](https://drivine.org/guide/#/).

---------------------------------------

## Tutorials

New to graph databases? Read some tutorials. 

* [Rock &amp; Roll Traffic Routing, with Neo4j](https://medium.com/neo4j/rock-n-roll-traffic-routing-with-neo4j-3a4b863c6030) 
* [Rock &amp; Roll Traffic Routing, with Neo4j, Chapter Two](https://medium.com/neo4j/rock-n-roll-traffic-routing-with-neo4j-part-2-f2a74fe7d7f) 

Have a tutorial you'd like to share? [Get in touch](https://twitter.com/doctor_cerulean) with me. 

---------------------------------------

## About

Drivine was created by [Jasper Blues](https://www.linkedin.com/in/jasper-blues-7781638) (that's me), who is also 
the creator of a popular iOS library called [Typhoon](https://github.com/appsquickly/typhoon), which is included in thousands of iOS apps including Audible.com, AMEX, Etihad Airlines, Singapore Airlines and others.

This library is based on an architecture that was put in place for <a href="https://www.trevipay.com/">TreviPay</a> (then called MSTS), after the company signed several Fortune 100 clients and needed to scale their payment service. The result was not only an improved architecture, but response times improved dramatically - from just under 2000ms seconds to around 63ms. 

The ideas were ruminated upon while building <a href="https://apps.apple.com/us/app/vampr/id1069819177">Vampr</a> - a growing social network for musicans that needs to serve hundreds of transactions per second. Clean architecture and performance are often competing concerns, so how would one go about getting the best of both worlds?

Drivine shows that it is not necessary to forego clean architecture in order to achieve scaleability goals. 


## Feedback 

#### I'm not sure how to do [xyz]

> If you can't find what you need in the Quick Start or User Guides, please [post a question on StackOverflow](https://stackoverflow.com/questions/tagged/drivine?sort=newest&pageSize=15), using the Drivine tag. 

#### Interested in contributing?

> Great! A contribution guide, along with detailed documentation will be published in the coming days. 

#### I've found a bug, or have a feature request

> Please raise a <a href="https://github.com/liberation-data/drivine/issues">GitHub</a> issue.

----

### Have you seen the light? 

Drivine is a non-profit, community driven project. We only ask that if you've found it useful to star us on Github or send a tweet mentioning us (<a href="https://twitter.com/@doctor_cerulean">@doctor_cerulean</a>). If you've written a Drivine related blog or tutorial, or published a new Drivine-powered app, we'd certainly be happy to hear about that too. 

Drivine is sponsored and led by <a href="https://www.linkedin.com/in/jasper-blues-7781638/">Jasper Blues</a> with <a href="https://github.com/liberation-data/Drivine/graphs/contributors">contributions from around the world</a>. 
 
---------------------------------------

## License

Copyright (c) 2022 Jasper Blues

Drivine is free software: you can redistribute it and/or modify it under the terms of the APACHE LICENSE, VERSION 2.0
as published by the Apache Software Foundation, either version 2 of the License, or (at your option) any later version.
This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied
warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the Apache Software License, Version 2.0 for more details.
You should have received a copy of the Apache Software License along with this program.
If not, see <http://www.apache.org/licenses/>.
 
