# Object Mapping

Drivine provides graph-to-object mapping facilities, however, as described in the introduction, due to its design goal of **optimal performance** it differentiates from the most typical approaches.

In a typical application that uses an ORM or OGM:

* Generalised entities - a network of classes that represent things in our domain are defined.
* Instances of these domain entities are loaded. The OGM tool generates queries for this on our behalf.
* Having loaded instances of our generalised entities, information is plucked and mapped onto use-case specific payload objects.

## Trouble Ahead:

The approach can work, however when an application needs to be highly scaleable, several problems are entailed:

* There is an overhead to the mapping, both in terms of implementation effort as well as runtime performance cost.
* Because the queries are system-generated, there is limited opportunity to efficiently undertake performance tuning.
* Similarly, because the entities are generalized, it is unlikely that the the generated queries will be the optimal ones for a specific use-case.
* Finally, it is an unfortunate truth that the main benefit of generalised entities, a rich set of expressive objects is usually forgone. We end up with an Anemic Domain Model, which Martin Fowler writes about [here](https://martinfowler.com/bliki/AnemicDomainModel.html).

In the referenced article, Mr Fowler states that he is not sure why the anemic domain model anti-pattern is so predominant. In my opinion, one primary cause is that most ORM/OGM tools do not offer to inject service dependencies onto the entities. In order to exhibit richer, more expressive behavior, entities will surely collaborating services to assist in that. To support rich models, the OGM tool can offer to inject registered services, so that this entities have an opportunity to provide expressive behaviors and not just holders of data. A future version of Drivine may offer to do this.

In the meantime, whatever the cause, it still does nothing to address the first four points, so let's explore . .

## Object Mapping - Drivine Approach:

In order to benefit from cleanly architected code that can scale to many thousands of transactions per second, Drivine takes the following approach:

* Queries are defined by you in a self-contained file. Because they are self-contained, they can be modified, formatted, tested and tuned easily using the tool of your choice. I personally like IntelliJ’s Graph Database Support.
* Queries are injected to be used in repositories with a decorator.
* Rather than defining a generalised set of entities, focus on use-case specific scenarios that project or update a sub-graph from the underlying whole graph. You can extract generalised entities later on, however avoid big design up-front.

## Object Mapping with Class Transformer:

We can need perform type-coercion of dates, numbers or enums. We can load a set of related entities into a type. Object mapping is provided by the class transformer.

```typescript
export class Route {
    readonly start: string;
    readonly destination: string;
    readonly metros: string[];
    @Expose({ name: 'travel_time' })
    public readonly travelTime: number;

    @Type(() => Photo)
    readonly significantSites: Photo[];

    constructor(start: string, destination: string, metros: string[], travelTime: number) {
        this.start = start;
        this.destination = destination;
        this.metros = metros;
        this.travelTime = travelTime;
    }

    /**
     * Returns metros omitting the start and destination.
     */
    public intermediateMetros(): string[] {
        const result = [...this.metros];
        result.shift();
        result.pop();
        return result;
    }
}
```

## Object Mapping Manually 

If you wish, you can map the results yourself or return a plain `any` typed object. Here's an example: 

```typescript 
@Injectable()
export class HealthRepository {
    public constructor(public readonly persistenceManager: NonTransactionalPersistenceManager) {}

    public async countAllVertices(): Promise<number> {

        return this.persistenceManager.getOne<number>(
            new QuerySpecification(`match (n) return count(n) as count`)
                .map((it) => it.count);
        );
    }
}
```

Instead of calling the `transform` method on query builder call `map`. Alternatively if neither `transform` nor `map` method is called, then plain `any` typed results are returned. 