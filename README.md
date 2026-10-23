<a href="https://drivine.org/"><img src="https://raw.githubusercontent.com/liberation-data/drivine/master/website/public/images/splash.jpg" alt="Drivine: graph database client for TypeScript, Python and the JVM"></a>
# <a href="https://drivine.org/">drivine</a>

**Docs: [drivine.org](https://drivine.org/ts/)**, for TypeScript, Python, and Kotlin & Java.

Drivine is a graph database client for Node.js and TypeScript, with a [NestJS](https://nestjs.com/) module, and no need
for one: see [Without Nest](#3-without-nest). It supports **Neo4j**, **Memgraph**, **FalkorDB**, **Oracle** (SQL/PGQ)
and **Postgres** as graph stores, plus Amazon Neptune through the low-level API. It gives you two ways to work with a
graph:

1. **PersistenceManager**: a low-level API where you write the queries yourself. This is the classic Drivine approach.
2. **Object manager** (`StatelessGraphObjectManager`): a high-level API that maps decorated classes, with a typed
   query DSL whose references come from the classes themselves.

> **On Python or the JVM?** [drivine-python](https://github.com/liberation-data/drivine-python) (`pip install drivine`)
> is Drivine's Python twin, async first with a sync API. [drivine4j](https://github.com/liberation-data/drivine4j)
> (`org.drivine:drivine4j`) is its Java and Kotlin twin, the graph client for [Embabel](https://hub.embabel.com), with
> Spring Boot support and a code-generated DSL. The three share a storage format: a store written from any of them is
> read, stamped and checked alike by the others.

Its design goals:

* Support multiple graph databases, simultaneously if you wish.
* **Scale to hundreds and thousands of transactions per second, without compromising architectural integrity.**

## Contents

- [Philosophy](#philosophy)
- [Installation](#installation)
- [Quick Start](#quick-start)
  - [With Nest](#2-with-nest)
  - [Without Nest](#3-without-nest)
- [Object Manager](#object-manager)
  - [Key Concepts](#key-concepts)
  - [Loading Data](#loading-data)
  - [Query DSL](#query-dsl)
  - [Grouped Reads](#grouped-reads-groups)
  - [Saving Data](#saving-data)
  - [@NodeStamp](#nodestamp-refusing-a-save-when-the-node-changed)
  - [Deleting Data](#deleting-data)
  - [Polymorphism](#polymorphism)
  - [Mapping Decorators](#mapping-decorators)
  - [Relationships of a Runtime Type](#relationships-of-a-runtime-type)
- [PersistenceManager](#persistencemanager)
- [Supported Engines](#supported-engines)
- [Schema Management](#schema-management-indexes--constraints)
- [Multi-Database Support](#multi-database-support)
- [Security](#security)
- [Testing](#testing)
- [The Sample App](#the-sample-app)

## Philosophy

### Composition Over Inheritance

A typical ORM defines one reusable object model, and generates statements to move data between that model and the
database. That addresses the so-called impedance mismatch, at a cost:

* Generated queries work well for simple cases, but can get out of hand and perform badly when things get complex.
  Debugging generated statements can be painful.
* One model for many use cases is a big ask. The original CRUD cases work well, but in harder cases the model gets in
  the way more than it helps.

Those trade-offs may be acceptable for a relational database, but with a graph database the mismatch hardly exists.

Just as we favour composition over inheritance in software, we prefer composition when mapping the results of complex
queries. A person plays many roles: sometimes we help them have a great holiday, sometimes they manage a team,
sometimes they're a person of interest. With Drivine you compose a view for each use case:

```typescript
@GraphView()
export class HolidayingPerson {
    @Root() person: Person;

    @GraphRelationship({ type: 'BOOKED_HOLIDAY', target: () => Holiday })
    holidays: Holiday[];
}
```

Behind the scenes, Drivine writes one efficient statement:

```cypher
MATCH (person:Person)
WITH person, [(person)-[:BOOKED_HOLIDAY]->(holiday:Holiday) | holiday {.*}] AS holidays
RETURN { person: properties(person), holidays: holidays }
```

Composition lets you mix and match as needed.

## Installation

```bash
npm install @liberation-data/drivine
```

Drivine needs `reflect-metadata` and `neo4j-driver` as peer dependencies, and NestJS (6 to 11) only for its module. The
FalkorDB, Oracle (`oracledb`, thin mode, no Instant Client needed) and Postgres drivers are bundled.

The object manager reads decorators and their type metadata, so enable both in `tsconfig.json`:

```json
{
    "compilerOptions": {
        "experimentalDecorators": true,
        "emitDecoratorMetadata": true
    }
}
```

## Quick Start

### 1. Configuration

Connections come from the environment, or a `.env` file that Drivine loads. The default database is configured with
`DATABASE_*`, and a named one with `<NAME>_DATABASE_*`:

```bash
DATABASE_TYPE=NEO4J          # NEO4J, MEMGRAPH, FALKORDB, ORACLE, NEPTUNE or POSTGRES
DATABASE_HOST=localhost
DATABASE_PORT=7687
DATABASE_USER=neo4j
DATABASE_PASSWORD=password
DATABASE_NAME=neo4j          # optional on the graph engines; on Oracle, the service, e.g. FREEPDB1
DATABASE_POOL_MAX=40
DATABASE_CONNECTION_TIMEOUT=5000
```

Use them through Nest's module, or without Nest. Only the setup differs: the decorators, the DSL, `@Transactional`
and the managers are the same.

### 2. With Nest

Register the connections with the module, from `@liberation-data/drivine/nest`:

```typescript
import { DrivineModule } from '@liberation-data/drivine/nest';

@Module({
    imports: [
        DrivineModule.withOptions({
            connectionProviders: [DatabaseRegistry.buildOrResolveFromEnv()]
        })
    ],
    providers: [RouteRepository, PersonService]
})
export class AppModule {}
```

Then inject a persistence manager, an object manager or a statement. The `Inject…` decorators come from
`@liberation-data/drivine/nest` too; everything else from `@liberation-data/drivine`:

```typescript
@Injectable()
export class RouteRepository {
    constructor(
        @InjectPersistenceManager() readonly persistenceManager: PersistenceManager,
        @InjectCypher(__dirname, 'routesBetween') readonly routesBetween: CypherStatement
    ) {}

    @Transactional() // Propagation.REQUIRED by default: join the current transaction, or start one.
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

Or, with the object manager, declare what you want and let Drivine write the statement:

```typescript
@Injectable()
export class PersonService {
    constructor(@InjectGraphObjectManager() readonly gom: StatelessGraphObjectManager) {}

    async leads(): Promise<PersonCareer[]> {
        return this.gom.loadAll(PersonCareer, (q) => ({ where: q.person.bio.containsIgnoreCase('lead') }));
    }
}
```

The module closes the connections when the application stops.

### 3. Without Nest

In Express, Fastify, a job or a CLI, make the factories yourself, once, and hand the managers to your classes:

```typescript
import {
    cypherStatement,
    DatabaseRegistry,
    GraphObjectManagerFactory,
    inDrivineContext,
    PersistenceManager,
    PersistenceManagerFactory,
    QuerySpecification,
    StatelessGraphObjectManager,
    Transactional
} from '@liberation-data/drivine';
import { readFileSync } from 'fs';

DatabaseRegistry.buildOrResolveFromEnv();                  // and buildOrResolveFromEnv('ANALYTICS'), …
const persistenceManagers = new PersistenceManagerFactory();
const graphObjectManagers = new GraphObjectManagerFactory(persistenceManagers);

export class RouteRepository {
    private readonly routesBetween = cypherStatement(readFileSync(`${__dirname}/routesBetween.cypher`, 'utf8'));

    constructor(readonly persistenceManager: PersistenceManager = persistenceManagers.get()) {}

    @Transactional() // the same as in Nest: join the current transaction, or start one
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

export class PersonService {
    constructor(readonly gom: StatelessGraphObjectManager = graphObjectManagers.get()) {}

    async leads(): Promise<PersonCareer[]> {
        return this.gom.loadAll(PersonCareer, (q) => ({ where: q.person.bio.containsIgnoreCase('lead') }));
    }

    @Transactional()
    async hire(person: Person): Promise<void> {
        await this.gom.save(person);
    }
}
```

**`@Transactional` needs no setup.** Drivine keeps the transaction in Node's `AsyncLocalStorage`, which follows every
`await`. A marked method starts a transaction when none is running, and every marked method it calls, in any class,
joins it. Nothing passes a transaction or a context around:

```typescript
class AuditLog {
    constructor(readonly gom: StatelessGraphObjectManager = graphObjectManagers.get('AUDIT')) {}

    @Transactional()
    async record(event: AuditEvent): Promise<void> {
        await this.gom.save(event);
    }
}

class Onboarding {
    constructor(readonly people = new PersonService(), readonly audit = new AuditLog()) {}

    @Transactional()
    async onboard(person: Person): Promise<void> {
        await this.people.hire(person);                           // joins onboard's transaction
        await this.audit.record(AuditEvent.hired(person));        // so does this, on another database
    } // both commit here; a throw anywhere in it rolls both back
}
```

To run a block in one transaction without a decorator:

```typescript
await inDrivineContext()
    .withTransaction()
    .run(async () => { /* … */ });
```

Close the connections when the application stops:

```typescript
await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
```

[`sample/lambda`](sample/lambda) is a runnable example: an AWS Lambda handler, `export const handler`, with the
factories made once per cold start, a repository, and a `@Transactional` service that rolls a hire back when it takes an
organization past its headcount. `npm run start-lambda-sample` serves it on your machine, on `PORT` (3000) and over the
database `DATABASE_*` configures:

```bash
curl -X POST localhost:3000/hires -d '{"name": "Ada", "bio": "Team Lead", "organization": "Acme", "role": "CTO"}'
curl localhost:3000/leads
```

### Return One Map

When you write a statement yourself, return a **single map** or a **scalar**, not several columns. That maps cleanly
with `.transform()` and avoids trouble with nulls:

```cypher
-- Wrong: several columns, awkward to map
RETURN a.name, a.age, b.title

-- Right: one map
RETURN { name: a.name, age: a.age, title: b.title } AS result

-- Right: a node's properties, or a scalar
RETURN properties(p)
RETURN count(p) AS total
```

## Object Manager

`StatelessGraphObjectManager` maps decorated classes to the graph. It writes the statements itself, and gives you a
typed DSL for filtering and ordering.

It keeps no state between calls. A load returns what the store holds. What a save writes depends only on the object
and the options you pass.

Inject one for each database:

```typescript
constructor(
    @InjectGraphObjectManager() readonly gom: StatelessGraphObjectManager,              // the default database
    @InjectGraphObjectManager('ANALYTICS') readonly analytics: StatelessGraphObjectManager
) {}
```

Or take one from `GraphObjectManagerFactory`, which the module provides: `factory.get('ANALYTICS')`. Without Nest, from
the factory you made: `graphObjectManagers.get('ANALYTICS')`.

### Key Concepts

#### 1. NodeFragment: a Node

A `@NodeFragment` maps one node. Every property of the object is stored, unless it is marked `@GraphTransient()`:

```typescript
@NodeFragment({ labels: ['Person'] })
export class Person {
    @NodeId() uuid: string;
    name: string;
    bio?: string;
}
```

A fragment names at least one label. A subclass carries its own labels as well as its superclass's: see
[Polymorphism](#polymorphism).

**Defaults for missing properties.** A property the node doesn't have keeps the class's initializer. Two decorators
handle a stored null:

```typescript
@NodeFragment({ labels: ['User'] })
export class UserNode {
    @NodeId() id: string;
    @Default() status = 'active';        // a stored null loads as 'active'
    @EmptyWhenAbsent() tags: string[];   // absent or null loads as []; an object loads as {}
}
```

#### 2. RelationshipFragment: a Relationship's Properties

A `@RelationshipFragment` holds the properties of a relationship, and the node it leads to:

```typescript
@RelationshipFragment()
export class WorkHistory {
    startDate: string;                  // a property of the relationship
    role: string;                       // and another
    @TargetNode() target: Organization; // the node it leads to
}
```

Use it for employment history, transactions, audit trails, or any relationship with data of its own.

#### 3. GraphView: Composing Fragments

A `@GraphView` composes fragments and relationships into one result. `@Root` marks where the query starts:

```typescript
@GraphView()
export class PersonCareer {
    @Root() person: Person;

    @GraphRelationship({ type: 'WORKS_FOR', target: () => WorkHistory })
    employmentHistory: WorkHistory[] = [];
}
```

`@GraphRelationship` takes:

| Option | Meaning |
|---|---|
| `type` | The relationship type. |
| `direction` | `Direction.OUTGOING` (the default), `INCOMING` or `UNDIRECTED`. |
| `target` | The class of the related item: a fragment, a relationship fragment or a view, as a function so that classes may refer to each other in either order. It is required for a list, since TypeScript records only `Array` as a list's type. For a single item it defaults to the property's type. |
| `required` | Only roots that have the relationship are loaded. TypeScript erases `?:`, so a view says this rather than the type: see [Required Relationships](#required-relationships). |
| `maxDepth` | For a recursive relationship, how deep to expand. Defaults to 1. |

When a view refers to a class declared later in the same module, type the property with `Related<T>`, so the decorator
metadata doesn't read the class before it exists: `@GraphRelationship({ type: 'TO_B', target: () => B }) b?: Related<B>`.

#### 4. Recursive Relationships: Hierarchies and Ontologies

A view whose relationship targets its own class is expanded to `maxDepth` levels:

```typescript
@NodeFragment({ labels: ['Location'] })
export class Location {
    @NodeId() uuid: string;
    name: string;
    type: string;
}

@GraphView()
export class LocationHierarchy {
    @Root() location: Location;

    @GraphRelationship({ type: 'HAS_LOCATION', target: () => LocationHierarchy, maxDepth: 3 })
    subLocations: LocationHierarchy[];
}
```

At the last level a list is `[]` and a single item is undefined. To walk upwards, make another view with
`direction: Direction.INCOMING`. A query can override the depth:

```typescript
await gom.loadAll(LocationHierarchy, (q) => ({
    where: q.location.type.eq('continent'),
    depth: { subLocations: 5 }
}));
```

Cycles through other views (A → B → A) are expanded to `maxDepth` as well. A view nested in itself is saved, each level
one relationship from the one above. A list of *fragments* read over several hops (`maxDepth` above 1 on a list of a
fragment) is loaded and never written.

#### 5. Path Traversal: Skipping Intermediate Nodes

`@GraphRelationship` is one hop. `@GraphPath` follows several and maps only the node at the end:

```typescript
@GraphView()
export class ActorDirectors {
    @Root() actor: Actor;

    @GraphPath([hop('ACTED_IN', Direction.OUTGOING, 'Movie'), hop('DIRECTED_BY')], { target: () => Director })
    directors: Director[];
}
```

Each node at the end is returned once: an actor who made two movies with one director gets that director once. A
`hop`'s label constrains the node it reaches. `required: true` keeps only the roots the path leads somewhere from. A
path is read-only.

One hop may name an **order**: a property of the node it reaches, lowest first unless `ascending` is `false`. A list then
holds its targets in the order of the first node of that hop that leads to each, and a single field holds the target the
first such node leads to:

```typescript
@GraphView()
export class SessionStarter {
    @Root() session: Session;

    // who wrote the earliest message
    @GraphPath([hop('HAS_MESSAGE', Direction.OUTGOING, 'Message', 'sentAt'), hop('AUTHORED_BY')], { target: () => Person })
    startedBy?: Person;
}
```

A node of the ordered hop without the property comes last, whichever way the path is read. Targets whose first nodes
hold equal values come in no set order. The property should hold values of one type: every backend reads the order the
same way where it does, a text of digits such as `'0100'` is ordered as text, and an empty text is a text, the lowest
one. Where it holds texts on some nodes and
numbers on others, every backend reads every text before every number lowest first, and after them highest first, as
Neo4j's ORDER BY does. A group key's path names no order: `pathKey` refuses one.

#### 6. Aggregates: Counting and Summarising Without Loading

`@Count` and `@Aggregate` compute a number for each root in the query, so you don't load a list just to size it:

```typescript
@GraphView()
export class ActorStats {
    @Root() actor: Actor;
    @Count('ACTED_IN') movieCount: number;
    @Aggregate({ function: AggregateFunction.AVG, type: 'RATED', property: 'score' }) avgRating?: number;
    @Aggregate({ function: AggregateFunction.SUM, type: 'RATED', property: 'score' }) totalRating: number;
}
```

`SUM` and `COUNT` over nothing are 0; `AVG`, `MIN` and `MAX` over nothing are undefined. Aggregates follow one hop and
belong to one root. To group nodes by a key and rank the groups, use a [grouped read](#grouped-reads-groups).

### Loading Data

```typescript
const everyone = await gom.loadAll(PersonCareer);
const one = await gom.load(PersonCareer, uuid);                          // undefined when there is none
const open = await gom.loadAll(Issue, (q) => ({ where: q.state.eq('open') }));
const raw = await gom.loadAll(Issue, 'n.state = $state', { state: 'open' }); // a predicate of your own, over n
```

#### Count

`count` counts exactly what `loadAll` would return for the same type and filter:

```typescript
await gom.count(Issue);
await gom.count(Issue, (q) => ({ where: q.state.eq('open') }));
await gom.count(RaisedAndAssignedIssue);   // only the issues that meet the view's required relationships
```

A fragment is counted by its labels. A view counts only the roots that meet its required relationships and paths, so
the number equals `loadAll(...).length`, not a count of nodes.

#### Vector Search (`loadNearest`)

`loadNearest` runs an approximate nearest-neighbour search and returns each hit with a similarity score. It works on a
view, by its root's embedding, and on a fragment:

```typescript
@NodeFragment({ labels: ['Proposition'] })
export class PropositionNode {
    @NodeId() id: string;
    text: string;
    @VectorIndex({ similarity: 'COSINE' }) embedding?: number[];
}

const hits: Scored<PropositionView>[] = await gom.loadNearest(PropositionView, queryEmbedding, { topK: 20 });
hits.forEach((it) => console.log(it.score, it.value.proposition.text));
```

The searched embedding is the fragment's `@VectorIndex` field: inferred when there is one, and named with `property`
when there are several. The score is a similarity, higher meaning more similar, on every engine, so `threshold` means
the same thing everywhere.

| Option | Meaning |
|---|---|
| `topK` | How many to return. Without `searchK`, also how many the index is asked for. |
| `searchK` | How many the index is asked for, at least `topK`. `topK` then trims after the filter. |
| `threshold` | The least score a hit may have. |
| `where` | A condition applied after the search: references, or a predicate over `n` with `bindings`. |
| `partitionLabel` | Search the index of another label over the same property: one index per corpus or tenant. |
| `property` | Which `@VectorIndex` field, when the fragment has several. |
| `depth` | `maxDepth` overrides for a view. |

**`topK` is the index's `k`, not a promised count.** A view's required relationships, `threshold` and `where` filter
after the search, so a search can return fewer than `topK`.

**`k` is also the search's beam.** On Lucene-backed engines the result queue is the HNSW candidate queue, so a small
`k` can miss a vector that really is nearest. `searchK` widens the search without widening the result:

```typescript
// search with a beam of 200, and return the best 40 that pass the filter
await gom.loadNearest(PropositionView, queryEmbedding, {
    topK: 40,
    searchK: 200,
    where: (q) => [q.proposition.contextId.eq(ctx), q.mentions.any((m) => m.resolvedId.eq(entityId))]
});
```

A filtered search dilutes: at 22% selectivity, 40 asked for returns about 9, the nearest overall that happen to pass
rather than the nearest of those that pass. `searchK` mitigates that. A per-partition index avoids it: with one vector
index for each partition label, `partitionLabel` searches inside the partition, which is filtered by construction.

#### Full-Text Search (`loadMatching`)

`loadMatching` is the full-text mirror of `loadNearest`. The relevance is scaled to `[0, 1]`, the best hit being 1:

```typescript
@NodeFragment({ labels: ['Chunk'] })
export class ChunkNode {
    @NodeId() id: string;
    @FullTextIndex() text: string;
}

await gom.loadMatching(ChunkNode, 'graph databases', { topK: 20 });
await gom.loadMatching(ChunkView, 'graph databases', { topK: 20, threshold: 0.5, where: (q) => q.chunk.sectionId.eq('s1') });
```

The index is the fragment's `@FullTextIndex`: on a property for one field, or on the class,
`@FullTextIndex({ properties: ['title', 'body'] })`, for several. Name one with `property` when the fragment declares
more than one. The text is the engine's full-text language (Lucene on Neo4j): escape user input yourself.

### Query DSL

A query is a function of the class's **references**, `q`, which mirror its fields. The compiler checks each one, so a
query over a field the class doesn't have, or a comparison with a value of the wrong type, doesn't compile:

```typescript
const leads = await gom.loadAll(PersonCareer, (q) => ({
    where: q.person.bio.contains('Lead'),
    orderBy: q.person.name.asc(),
    limit: 20
}));
```

A query may hold `where`, `orderBy`, `limit`, `skip`, `seek` and `depth`.

#### Conditions

```typescript
// AND: a list of conditions
where: [q.person.name.eq('Alice'), q.person.bio.isNotNull()]

// OR, AND and NOT
where: anyOf(q.person.name.eq('Alice'), q.person.name.eq('Bob'))
where: [q.issue.state.eq('open'), anyOf(q.issue.id.eq(123), q.assignedTo.name.eq('Alice'))]
where: not(q.issue.locked.eq(true))

// a relationship's target, or a nested view's root and relationships
where: q.assignedTo.name.eq('Alice')
where: q.raisedBy.worksFor.name.startsWith('Ac')
```

A condition on a relationship holds when at least one related node meets it. Each condition is its own existence check,
so two conditions need not hold of the same related node. When they must, use `any`:

```typescript
// propositions with at least one mention that resolves to this entity
where: q.mentions.any((m) => m.resolvedId.eq(entityId))

// one mention that is both the subject and resolves to this entity
where: q.mentions.any((m) => [m.role.eq('SUBJECT'), m.resolvedId.eq(entityId)])

// propositions with no such mention, including those with no mentions at all
where: q.mentions.none((m) => m.resolvedId.eq(entityId))
```

#### Operators

| Kind | Operators |
|---|---|
| Comparison | `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `notIn` |
| Text | `contains`, `startsWith`, `endsWith`, `matches` (a regular expression; not on FalkorDB), `containsIgnoreCase`, `eqIgnoreCase` |
| Null | `isNull()`, `isNotNull()` |
| List property | `hasItem(value)`: the value is in a list-valued property, the mirror of `in` |
| Logic | `anyOf(...)`, `allOf(...)`, `not(...)`, a list for AND |
| Labels | `instanceOf(Type)`: the node carries all the labels of a fragment class. `hasAnyLabel('A', 'B')`: it carries any of them |
| Order | `asc()`, `desc()`, then `nullsFirst()` or `nullsLast()` |

`gt`, `gte`, `lt` and `lte` are offered on numbers, texts and dates, and the text operators on texts alone.

#### Querying Fragments

The DSL isn't only for views. Every fragment has references to its own fields:

```typescript
await gom.loadAll(ChunkNode, (q) => ({ where: q.sectionId.eq('sec-1') }));
await gom.count(ChunkNode, (q) => ({ where: q.sectionId.eq('sec-1') }));
await gom.loadAll(WebUser, (q) => ({ where: q.instanceOf(AnonymousWebUser) }));
```

A reference uses the field's name. Drivine maps it to the stored name, whether `@GraphProperty` renamed it or it is a
`@NodeStamp` field, and an entry of a `@PropertyBag` is reached through the bag: `q.metadata.source.eq('wiki')`.

#### Runtime Keys

When the property isn't known until run time, such as an arbitrary bag key or a filter a caller names, give the stored
name. Values are still bound as parameters:

```typescript
where: q.property('metadata.source').eq('wiki')
where: q.predicate('metadata.tags', 'HAS_ITEM', 'kotlin')
```

A name that isn't a plain identifier is quoted for you, and can't break out of its quotes.

#### Ordering

```typescript
orderBy: [q.person.name.asc(), q.person.uuid.asc()]
orderBy: q.proposition.confidence.desc().nullsLast()
```

Left to itself, the database decides where rows with no value go. Cypher ranks null above every value, so a descending
order starts with them. `nullsFirst()` and `nullsLast()` say otherwise. No index supplies that order, so leave it off a
property that is never null.

**An order by an expression.** A ranking computed from several properties is an expression over the root's
properties, built from `plus`, `minus`, `times`, `div`, `negate`, `exp`, `floor`, `coalesce`, `epochSeconds` and
`caseOf`. Every value you give is bound. The ranking runs in the database with its `limit`, and later terms break its
ties:

```typescript
orderBy: [
    caseOf([above(q.validFrom, asOf).or(atMost(q.validTo, asOf)).then(0)],
           times(q.confidence, exp(negate(times(q.decay, floor(div(minus(epochSeconds(asOf), q.lastAccessedSeconds), 86400)))))))
        .desc(),
    q.id.asc()
]
```

An expression reads only the root's properties, and is refused with `seek`.

**Ordering a relationship's list.** An order on a relationship's property sorts that list in each object, not the
roots: `orderBy: [q.issue.id.desc(), q.assignedTo.name.asc()]` orders the issues by id, and each issue's assignees by
name. A nested view's list sorts the same way: `q.raisedBy.worksFor.name.desc()`. This works the same on every engine
and needs no plugin. A recursive list can't be ordered by the query: use `@SortedBy`, which orders every level.

**`@SortedBy`** sorts a list relationship after it is loaded, on every load of the view:

```typescript
@GraphRelationship({ type: 'HAS_CONTRIBUTOR', target: () => Contributor })
@SortedBy('name')                      // ascending; @SortedBy('name', false) for descending
contributors: Contributor[];

@SortedBy('contributor.name')          // a path into a related view or relationship fragment
```

Nulls go last.

#### Limit and Pagination

`limit` and `skip` are applied in the database, after the order:

```typescript
await gom.loadAll(PropositionView, (q) => ({ orderBy: q.proposition.created.desc(), limit: 20 }));
await gom.loadAll(PropositionView, (q) => ({ orderBy: q.proposition.created.desc(), skip: 40, limit: 20 }));
```

For a view, `limit` bounds the roots: each view still has all its relationships. Pair it with `orderBy`, or the subset
is arbitrary. `count` ignores `limit` and `skip`.

For large or changing results, page by **keyset** with `seek`. Its values follow the order's terms, in the same order.
Drivine works out each comparison from the direction. End the order with a unique key, so that ties can't be skipped or
repeated:

```typescript
const page = await gom.loadAll(SessionView, (q) => ({
    orderBy: [q.session.lastActivityAt.desc(), q.session.sessionId.desc()],
    seek: cursor ? [q.session.lastActivityAt.after(cursor.lastActivityAt), q.session.sessionId.after(cursor.sessionId)] : undefined,
    limit: pageSize + 1   // one more than a page tells you whether there is a next one
}));
```

- **The ordered properties must not be null.** A row whose key is null meets no comparison, so it drops out of every
  page after the first.
- `seek` is refused without a matching order, with a null cursor value, with `skip`, with an order that places its
  nulls, and with an expression.
- **Index the cursor.** A keyset is cheap only where the engine can seek into an index and stop. The index mirrors the
  cursor: a range index over exactly the ordered properties, in order, such as
  `@RangeIndex({ properties: ['lastActivityAt', 'sessionId'] })` on the class. Profiled on Neo4j with 200,000 nodes, a
  page from the middle took 27 database accesses with that index, 200,020 with an index on the first key alone, and
  500,010 with none.
- This is about Neo4j. Memgraph and FalkorDB sort between the scan and the limit whatever is indexed, so a keyset costs
  what is left rather than a page. `seek` is still worth having there, for pages that don't shift under concurrent
  writes.

**Drivine tells you when the index is missing.** An ordered query is checked against the database's indexes, and one
that nothing mirrors is reported, once for each label and set of properties. Ordering without an index is correct,
only unindexed, so the default is to warn. Turn it up in development or CI:

```typescript
DrivineModule.withOptions({
    connectionProviders: [DatabaseRegistry.buildOrResolveFromEnv()],
    query: { indexAdvice: 'FAIL' }   // 'WARN' (the default) or 'OFF'
});
```

That applies to every manager the module makes. Without Nest, give it to the factory:
`new GraphObjectManagerFactory(persistenceManagers, { indexAdvice: 'FAIL' })`. To change one manager:
`gom.indexAdvice = 'FAIL'`. A query pinned to one root, by an equality on the id or on a uniquely constrained property,
is never advised on. The index list is read once and kept; after making indexes as the application runs, call
`gom.indexAdvisor.refresh()`.

### Grouped Reads (`groups`)

`gom.groups` groups a fragment's nodes by a key and gives numbers about each group: a count, a sum, a ranking. It is
one statement on every engine, Oracle included, and nothing is loaded to be tallied in the application.

Each part of a grouped read is a clause of the query you would write by hand:

| Here | Cypher | SQL |
| --- | --- | --- |
| `groups.load(T, ...)` | `MATCH (n:T)` | `FROM t` |
| `where` | `WHERE` before the `WITH` | `WHERE` |
| `keys: { page: key(q.page) }` | `WITH n.page AS page, …` | `GROUP BY page` |
| `keys: { user: pathKey(User, [...]) }` | `MATCH (n)-[…]->(user:User)`, then `WITH user, …` | a join, then `GROUP BY` its id |
| `aggregates: { votes: count() }` | `count(n) AS votes` | `COUNT(*) AS votes` |
| `aggregates: { likes: count(q.helpful.eq(true)) }` | `sum(CASE WHEN … THEN 1 ELSE 0 END) AS likes` | the same |
| `having` | `WHERE` after the `WITH` | `HAVING` |
| `orderBy`, `limit`, `skip` | `ORDER BY`, `LIMIT`, `SKIP` | `ORDER BY`, `OFFSET`, `FETCH FIRST` |

The examples use a piece of feedback on a docs page:

```typescript
@NodeFragment({ labels: ['Feedback'] })
export class Feedback {
    @NodeId() id: string;
    page: string;
    helpful: boolean;
    createdAt: Date;
}
```

**Group and count.** "For each page, how many?"

```typescript
const votes: Map<string, number> = await gom.groups.countBy(Feedback, 'page');
// Map { '/agents' => 2, '/install' => 3 }
```

**Several numbers, and the three filters.**

```typescript
const ratings = await gom.groups.load(Feedback, (q) => ({
    where: q.createdAt.gte(march),                                // 1. which nodes are read at all
    keys: { page: key(q.page) },
    aggregates: { votes: count(), likes: count(q.helpful.eq(true)) }, // 2. which nodes count toward one number
    having: [['votes', 'gte', 3]],                                // 3. which groups are returned
    orderBy: [['votes', 'desc']],
    limit: 10
}));
// [{ page: '/install', votes: 3, likes: 2 }, …]: each row is typed by its keys and aggregates
```

| Filter | Removes |
| --- | --- |
| `where` | nodes, before anything is grouped |
| a filtered aggregate | nothing: it decides which nodes that one number counts |
| `having` | whole groups, after they are counted |

The mistake to look for is `helpful.eq(true)` moved into `where`. It is valid, and then `votes` counts only the helpful
ones, so `likes` equals `votes` on every row.

**Group by a node, not a value.** "For each user, how many messages did they write?" A path says how a message reaches
its owner, and the key comes back as the node, mapped as a load of its fragment maps it:

```typescript
const top = await gom.groups.load(Message, (q) => ({
    where: q.role.eq('USER'),
    keys: { user: pathKey(GuideUser, [hop('HAS_MESSAGE', Direction.INCOMING, 'ChatSession'), hop('OWNED_BY')]) },
    aggregates: { messages: count() },
    orderBy: [['messages', 'desc']],
    limit: 5
}));
top.map((it) => [it.user.username, it.messages]);
```

The aggregates are `count(filter?)`, `sum(property, filter?)`, `avg`, `min` and `max`. `having` compares an aggregate
with a number by `eq`, `neq`, `gt`, `gte`, `lt` or `lte`, its entries joined by AND.

What every engine agrees on:

- A group exists because a node is in it.
- A node that reaches no key node is in no group. One that reaches several is in each, and once in each, however many
  ways lead there.
- `sum`, `avg`, `min` and `max` skip a node with no value. Over no values `sum` is 0 and the others are undefined.
- An aggregate's filter never takes a node out of its group: a group none of whose nodes meet it still has 0.
- Ties are broken by the keys, ascending, so a top 5 is the same five on every engine.

Where Oracle differs: `min` and `max` of a text skip a value stored as `""`, which Oracle reads as no value. A `sum` or
an `avg` of decimals is decimal arithmetic, so 0.1 + 0.2 is 0.3 there.

### Saving Data

A save writes what the object holds. It doesn't depend on whether the object was loaded, or on anything the manager
remembers, because the manager remembers nothing.

```typescript
await gom.save(view);                                            // every field that is set; relationships are added, never removed
await gom.save(view, { replace: ['assignedTo'] });               // this field's list is the whole list
await gom.save(view, { replace: 'all' });                        // every relationship field's list is the whole list
await gom.save(chunk, { except: ['embedding'] });                // write everything but these
await gom.save(person, { only: ['name'] });                      // write just these
await gom.update(Person, id, (it) => { it.name = 'Ada'; });      // load, change, save what differs
await gom.create(person);                                        // make it only if it is not there; undefined when it is
await gom.edges.unrelate(nodeRef(Issue, a), nodeRef(Person, b), 'ASSIGNED_TO');
```

A save is one statement: the root, the relationships it drops, each related node and the relationship to it. It is
applied whole or not at all, with or without a transaction, on every engine.

`only` and `except` name fields of the object, and for a view fields of its root. A view's relationships are written
whatever they name. Give one or the other, not both.

`save` returns the saved object. On a class with a [`@NodeStamp`](#nodestamp-refusing-a-save-when-the-node-changed)
field, use the returned object from then on: it carries the stamps the save left, on the root and on each related node
that has one.

#### Relationships

A save adds the relationships the object holds and removes none. To remove, name the field in `replace`: its list is
then the whole list.

- A field removes only what it loads: relationships of its type and direction, to nodes with its target's labels.
- `removedTargets: RemovedTargets.DELETE_UNREFERENCED` also deletes a removed target that nothing else refers to the way
  the field did. The root is never deleted, nor is a node the object still holds in another field.
- `replace: 'all'` covers every relationship field of the view itself. It is refused for an object that carries no
  stamp, because the lists of an object built from scratch are not what the store holds.
- A list to replace that is null or undefined is refused. An empty list removes every relationship of the field, and a
  single-valued field that is null or undefined removes its relationship.
- `replace` is refused, on a root that carries a stamp, if any relationship of the root was added, removed or changed
  since the object was loaded. A save that only adds is not: two writers who loaded the same view can each add to it.
- An `UNDIRECTED` field is met by a relationship stored either way. One is made, from the root, only when there is none.
- A read-only field is never written: a `@ReadOnly()` field, a `@GraphPath`, a `@Count` or `@Aggregate`, and a list of
  fragments read over several hops.

#### Load, Change and Save (`update`)

`update` loads the object, applies your change, and writes only what the change altered: the fields that differ, a
field set to null, and for a view the relationships it added or dropped. Your change may alter the object it is given,
or return a copy.

```typescript
const saved = await gom.update(Person, id, (person) => {
    person.name = 'Ada';
});
```

- If the node changed between the load and the save, `update` loads it again and re-applies the change: three attempts
  by default (the fourth argument), then `StaleObjectException`. That needs a `@NodeStamp` field; without one a change
  by another writer goes unnoticed. On Neo4j the save compares the root's fields as they were loaded as well as the
  stamp: see [When a Save Is Refused](#when-a-save-is-refused).
- It returns undefined when there is no such node, or the node is deleted in between. It never makes a node.
- A change that gives the object another id or another class is refused.

#### Create If Absent (`create`)

`create` makes the node only if no node has its id, in one statement. If one does, it writes nothing and returns
undefined. With `update`, that saves an aggregate without losing any writer's data:

```typescript
const stored =
    (await gom.create(proposition)) ?? (await gom.update(Proposition, proposition.id, (it) => it.merge(proposition)));
```

- An object that carries a stamp was loaded, and is refused.
- Two writers at the same moment can both find the node absent. On Neo4j, Memgraph and Oracle only a uniqueness
  constraint on the id keeps the second from making the node again: `uniquenessConstraint('Proposition', 'id')`.
  FalkorDB runs one write at a time, so there the second always finds the first's node.

#### Null-Write Policy (`NullPolicy`)

```typescript
await gom.save(chunk);                                       // IGNORE (default): merge-patch
await gom.save(chunk, { nullPolicy: NullPolicy.CLEAR });     // a full overwrite: nulls clear
```

- **`IGNORE`** writes only fields that are set; a null or undefined field leaves the stored value. A partly-loaded
  object never destroys stored data, an embedding included.
- **`CLEAR`** makes the object authoritative: a null field clears its property. In JavaScript only keys the object holds
  can be seen, so a declared field that was never assigned is not cleared. Use it with a complete object.

In a view the policy governs the root. A related node is written as under `IGNORE`.

#### Batch Save (`saveAll`)

```typescript
const saved = await gom.saveAll(views);
await gom.saveAll(views, { replace: ['mentions'] });
await gom.saveAll(chunks, { only: ['summary', 'summaryModel'] });
```

- Fragments go in one statement for each 1,000, of any classes and labels. A view is a statement of its own. Outside a
  transaction of yours the statements run in one transaction, so a failure leaves nothing written; inside one they join
  it. FalkorDB has no transactions: see [FalkorDB](#falkordb).
- The objects come back in the order given, carrying the stamps the batch left. The batch writes the fragments' classes
  in the order of their names and the fragments of each in the order of their ids, so two batches over the same nodes
  take their locks in the same order.
- A batch that only adds doesn't check a fragment's stamp: a stale one is written anyway, and keeps the stamp it had, so
  a later `save` of it is refused.
- `replace` applies to views; a batch holding a fragment is refused with it. A stale view throws
  `StaleObjectException`, and the batch then writes nothing.
- With `only` or `except`, a node deleted since its object was loaded is made again. To write only where the node still
  exists, use `patchAll`.

#### Conditional Write by Id (`patch`)

Write named fields of one node, by its id, if the node meets a condition, in one statement. The node isn't loaded: the
store evaluates the condition under the node's lock.

```typescript
const result: PatchResult = await gom.patch(Session, sessionId, {
    set: { lastActivityAt: activityAt },
    where: (q) => anyOf(q.lastActivityAt.isNull(), q.lastActivityAt.lt(activityAt))
});
result.found;    // a node has the id
result.applied;  // the condition held, so the fields were written
result.changed;  // a value differed, and the node's stamp was renewed
```

| Outcome | `found` | `applied` | `changed` |
| --- | --- | --- | --- |
| No node has that id | false | false | false |
| The condition didn't hold | true | false | false |
| It held, and every value was already as set | true | true | false |
| It held, and a value differed | true | true | true |

On a view the fields are the root's, and the condition may name a relationship:

```typescript
const narrated = (await gom.patch(MessageInSession, messageId, {
    set: { narration },
    where: (q) => q.session.sessionId.eq(sessionId)
})).applied;   // false for a message that is there, but in another session
```

- `set` names fields to write, and `clear` fields to remove.
- It never makes a node, isn't checked against a stamp, and hands none back. A node it changed has a new stamp, so an
  object loaded before is refused when saved: load it again.
- The id, the stamp, a bag's key, a `@NodeLabels` field and a related node's field can't be written.

#### Batch Patch (`patchAll`)

Write named fields of many nodes, where each is there, making none:

```typescript
const results = await gom.patchAll(embedded, { only: ['embedding', 'embeddingModel'] });
const rewritten = results.filter((it) => it.found).length;
```

There is one `PatchResult` for each object, in order. `only` or `except` is required: to write every field, save.
Under `NullPolicy.IGNORE` a named field that is null is left as the store has it.

#### Saves and Transactions

- A save joins the transaction it runs in, a `@Transactional()` method's or `runInTransaction`'s. Outside one it is its
  own.
- `StaleObjectException` leaving a `@Transactional()` method rolls the transaction back. A refused save has written
  nothing; what the transaction wrote before it is undone only if the transaction rolls back.
- A statement the engine turns away because another writer was changing the same node is run again, after a pause,
  outside a transaction. Inside one it fails, and the transaction's owner decides.
- A statement that lost its connection is not run again, though the Neo4j driver calls that retriable: it may have been
  applied before the connection went, and a second run would find its own stamp and report a save that was applied as
  refused.

### @NodeStamp: refusing a save when the node changed

Strongly recommended on any class that is loaded, changed and saved. It plays the part of JPA's `@Version`: optimistic
locking, with a random value in place of a counter.

```typescript
@NodeFragment({ labels: ['Person'] })
export class Person {
    @NodeId() id: string;
    name: string;
    @NodeStamp() stamp?: string;
}
```

The field is an optional `string` on a `@NodeFragment`, one to a fragment. A stamp is a node's, so it is refused on a
view and on a relationship fragment.

#### The Stamp

The stamp is two random tokens of 64 bits each, stored on the node under `__drivine.stamp` as
`3fa9c1d27b40e8a6:91d0f4b2c7ee5a13`, whatever the field is called. Loading fills the field. Treat it as opaque.

- The **data token**, the first, speaks for the node's properties and labels.
- The **relationship token**, the second, speaks for its relationships, of every type, in both directions.
- To **mark** a node is to replace one of its tokens. A save marks what it changes, and so must Cypher of your own.

Every node a save writes is given a stamp if it has none, whether or not its class declares a `@NodeStamp` field.

#### When a Save Is Refused

A save is refused when what it would overwrite changed since the object was loaded. Every save of an object that
carries a stamp compares the data token. A save with `replace` compares the relationship token too. A refused save
writes nothing and throws `StaleObjectException`.

| Since the object was loaded, another writer… | `save` | `save` with `replace` | `update` |
|---|---|---|---|
| changed a property or a label of the root | refused | refused | loads again and re-applies the change |
| added or removed a relationship of the root, or changed one's properties | applied | refused | applied |
| changed a related node | applied: the related node is written over the change | the same | applied |
| deleted the root | refused, `deleted` is true | refused, `deleted` is true | returns undefined |
| changed anything with Cypher that doesn't mark it | not noticed | not noticed | not noticed |

An object whose stamp is undefined isn't checked: it makes the node or overwrites it. The save is one statement that
takes the node's write lock before it compares, so of several writers holding the same stamp exactly one succeeds.

**On Neo4j a load can be handed a stamp newer than its data.** Neo4j reads under read committed, without a snapshot, so
a load that runs while another writer commits can find that writer's stamp and the data from before its write. `update`
therefore compares each field of the root as it loaded it too, under the node's lock, and loads again if one differs: a
field's value (a `@JsonPacked` field's as the text the node held), a `@PropertyBag`'s keys and their values, and the
labels a `@NodeLabels` field reads. A field the object doesn't hold and its class doesn't initialize isn't compared. A
`save` of an object you loaded yourself has only the stamp to go on, and in that moment it can write over the other
writer's change: where every writer's change must be kept, change the node with `update`. Memgraph reads from a
snapshot, FalkorDB runs no read beside a write, and Oracle and Postgres read a statement whole, so on them the stamp is
what was read.

```typescript
try {
    await gom.save(edited);
} catch (e) {
    if (e instanceof StaleObjectException && !e.deleted) {
        // another writer got there first: e.foundStamp is what the node carries now
        await gom.update(Person, edited.id, (it) => { it.name = edited.name; });
    } else {
        throw e;
    }
}
```

#### Existing Data

A node written before stamps has none, and loads with the field undefined. The first save of it isn't checked and gives
it a stamp. To stamp every node of a label at once:

```typescript
await pm.execute(
    new QuerySpecification(`MATCH (n:Person) WHERE n.\`__drivine.stamp\` IS NULL SET ${Stamps.setClause('n')}`)
);
```

#### Cypher You Write Yourself

Cypher should mark what it changes: **a write that doesn't is not noticed**, and a checked save of an object loaded
before it is applied over it. `Stamps.setClause` marks a node whose properties or labels you change, and
`Stamps.linksClause` each end of a relationship you add, remove or change:

```typescript
`MATCH (p:Person {id: $id}) SET p.name = $name, ${Stamps.setClause('p')}`;

`MATCH (a:Person {id: $a}), (b:Person {id: $b})
 CREATE (a)-[:KNOWS]->(b)
 SET ${Stamps.linksClause('a')}, ${Stamps.linksClause('b')}`;
```

The property's name holds a dot, so Cypher that names it quotes it: `` n.`__drivine.stamp` ``. Cypher that replaces
every property (`SET n = $props`) removes the stamp, and the next checked save of an object loaded before is refused.

#### What a Stamp Doesn't Cover

- A related node isn't checked: `save` writes it whole. `update` writes only what the change altered.
- An object with no stamp isn't checked, nor is a fragment in a `saveAll`.
- One relationship token covers every relationship: a `replace` of one list is refused when a relationship of another
  type was added.
- Deleting a node removes its relationships without marking the nodes at their other ends.

### @ReadOnly: Loaded and Never Written

```typescript
@GraphView()
export class IssueOverview {
    @Root() issue: Issue;
    @GraphRelationship({ type: 'ASSIGNED_TO', target: () => Person }) assignedTo: Person[];                // written
    @ReadOnly() @GraphRelationship({ type: 'REVIEWED_BY', target: () => Person }) reviewers: Person[];     // loaded only
}
```

Every save skips a `@ReadOnly()` field. Naming it in `replace` is an error, and `replace: 'all'` leaves it alone.

### Deleting Data

```typescript
await gom.delete(Person, uuid);                                                  // returns how many: 1 or 0
await gom.delete(Issue, uuid, { where: (q) => q.state.eq('closed') });           // only if it meets the condition
await gom.deleteAll(Issue, (q) => ({ where: q.state.eq('closed') }));            // what a load with the filter finds
await gom.deleteAll(RaisedAndAssignedIssue, (q) => ({ where: q.assignedTo.name.eq('Former Employee') }));
await gom.deleteAll(Issue, 'n.locked = true');                                   // a predicate of your own, over n
```

A delete removes the root and its relationships. The nodes they led to stay, unless the delete cascades. Deleting a view
by id can also delete the nodes it reaches:

```typescript
await gom.delete(SessionView, sessionId);                                          // NONE: the root only
await gom.delete(SessionView, sessionId, { cascade: CascadeType.DELETE_ORPHAN });  // and each node left with no relationship
await gom.delete(SessionView, sessionId, { cascade: CascadeType.DELETE_ALL });     // and every node in the view
```

The cascade follows the view's relationships, through nested views; a node outside the view is never deleted.
`DELETE_ALL` deletes nodes others may still point at, so use it for nodes the root owns. `DELETE_ORPHAN` isn't available
on Memgraph.

### Polymorphism

A relationship can lead to nodes of several classes, told apart by their labels. Declare an abstract fragment and its
subclasses. A subclass carries its own labels and its superclass's:

```typescript
@NodeFragment({ labels: ['WebUser'] })
export abstract class WebUser {
    @NodeId() uuid: string;
    displayName: string;
}

@NodeFragment({ labels: ['Anonymous'] })
export class AnonymousWebUser extends WebUser {   // stored as (:WebUser:Anonymous)
    anonymousToken: string;
}

@NodeFragment({ labels: ['Registered'] })
export class RegisteredWebUser extends WebUser {  // stored as (:WebUser:Registered)
    email: string;
}

@GraphView()
export class GuideUserWithPolymorphicWebUser {
    @Root() core: GuideUser;
    @GraphRelationship({ type: 'IS_WEB_USER', target: () => WebUser }) webUser?: WebUser;
}
```

A node loads as the subclass its labels say, so `instanceof` tells them apart:

```typescript
for (const guide of await gom.loadAll(GuideUserWithPolymorphicWebUser)) {
    if (guide.webUser instanceof AnonymousWebUser) {
        console.log(guide.webUser.anonymousToken);
    }
}
```

A subclass is known once its module has been loaded, so import every subclass before the first load. A save writes
the labels of the object's own class.

**Filtering by subclass.** Either declare a view over the subclass, which loads only the roots related to one:

```typescript
@GraphView()
export class AnonymousGuideUser {
    @Root() core: GuideUser;
    @GraphRelationship({ type: 'IS_WEB_USER', target: () => AnonymousWebUser, required: true }) webUser: AnonymousWebUser;
}
```

or keep the polymorphic view and filter at query time:

```typescript
await gom.loadAll(GuideUserWithPolymorphicWebUser, (q) => ({ where: q.webUser.instanceOf(AnonymousWebUser) }));
await gom.loadAll(GuideUserWithPolymorphicWebUser, (q) => ({
    where: anyOf(q.webUser.instanceOf(AnonymousWebUser), q.webUser.instanceOf(RegisteredWebUser))
}));
```

#### Required Relationships

TypeScript erases `?:`, so a view says which relationships it requires:

| Declaration | Loads |
|---|---|
| `@GraphRelationship({ type: 'IS_WEB_USER' }) webUser?: WebUser` | every root; `webUser` is undefined where there is none |
| `@GraphRelationship({ type: 'IS_WEB_USER', required: true }) webUser: WebUser` | only the roots that have one |
| `@GraphRelationship({ type: 'IS_WEB_USER', target: () => WebUser }) webUsers: WebUser[]` | every root; `[]` where there are none |

### Mapping Decorators

#### @GraphProperty

Stores a field under another name. The field is `containerSectionId` in your code and in queries, and
`container_section_id` in the graph, on save, load, query and index:

```typescript
@GraphProperty('container_section_id') containerSectionId?: string;
```

#### @JsonPacked

Stores a value as a JSON string, for what an engine can't store as a property: a map, a list of maps, or a list on an
engine without list properties. Packed on write and unpacked on load:

```typescript
@JsonPacked() tags?: string[];
```

#### @PropertyBag

Maps an open object to a set of flat, prefixed node properties. Unlike `@JsonPacked`, each entry is a real property:
visible, filterable and indexable.

```typescript
@NodeFragment({ labels: ['Proposition'] })
export class PropositionNode {
    @NodeId() id: string;
    text: string;
    @PropertyBag() metadata: Record<string, any> = {};   // stored as metadata.<key>
}

await gom.loadAll(PropositionNode, (q) => ({ where: q.metadata.source.eq('wiki') }));
```

`{ source: 'wiki', score: 3 }` is stored as `metadata.source` and `metadata.score`. `prefix` decouples the stored
namespace from the field's name, and `delimiter` changes the separator. A value is a primitive or a list of them; a
nested object is refused. Under `NullPolicy.CLEAR` a save removes the keys the map no longer has; `IGNORE` leaves them.

A **flat** bag, `@PropertyBag({ flat: true })`, has no prefix: each entry is stored under its own key, and the bag reads
back every property that no declared field accounts for. A fragment may have one. A save refuses, before it writes
anything, an entry whose key is the stored property of a field (one that is decorated, initialized or set on the
object), the id's, one under another bag's prefix, or one beginning `__drivine.`, Drivine's own, such as the stamp:
the two would write the same property.

#### @NodeLabels

Maps a field to the node's labels, beyond the fragment's own. It is filled from the labels on load and written as labels
on save, so `MATCH (n:Admin)` finds a node whose field holds `Admin`:

```typescript
enum Role { Admin = 'Admin', Reviewer = 'Reviewer' }

@NodeFragment({ labels: ['Person'] })
export class PersonNode {
    @NodeId() id: string;
    @NodeLabels(Role) roles: Role[];          // a closed set: only these labels are the field's
}

@NodeFragment({ labels: ['Thing'] })
export class ThingNode {
    @NodeId() id: string;
    @NodeLabels() labels: string[];           // an open set: any label
}
```

Under `IGNORE` (the default) a save adds the field's labels. Under `CLEAR` it also removes the field's labels that the
field no longer holds. A closed field's labels are its members. An open field's are those it wrote itself, which it
records on the node under `__drivine.labels.<field>`. A label that isn't the field's, such as the fragment's own, is
never removed.

#### @GraphTransient

A field that is neither stored nor loaded.

### Relationships of a Runtime Type

A view declares its relationships, types included. When the type is data, use `gom.edges`:

```typescript
const lyre = nodeRef(ThingNode, 'lyre');
const ada = nodeRef(PersonNode, 'ada', 'Author');   // must also carry the label Author

await gom.edges.relate(lyre, ada, 'OWNED_BY', { since: 1990 });
await gom.edges.relate(lyre, ada, 'PLAYED_BY', {}, RelateMode.CREATE);
const owners = await gom.edges.loadRelated(lyre, 'OWNED_BY', Direction.OUTGOING, PersonNode);
await gom.edges.unrelate(lyre, ada, 'PLAYED_BY');         // every PLAYED_BY from lyre to ada
await gom.edges.unrelateAll(lyre, 'OWNED_BY');            // every OWNED_BY that leaves lyre
```

- Both ends are matched, never made. If either is missing, or lacks a label the reference names, nothing is written and
  `relate` returns false.
- `RelateMode.MERGE`, the default, keeps at most one relationship of the type between the two nodes in that direction,
  and sets its properties. `CREATE` makes another each time.
- `unrelate` and `unrelateAll` return how many relationships they removed. No node is deleted.
- Each marks the relationship token of both ends when it changes something.

## PersistenceManager

The low-level API: you write the statement, Drivine runs it, maps the rows and manages the transaction.

```typescript
const people = await pm.query(new QuerySpecification<Person>('MATCH (p:Person) RETURN properties(p)').transform(Person));
const person = await pm.getOne(spec);         // exactly one, or it throws
const maybe = await pm.maybeGetOne(spec);     // one or undefined
await pm.execute(spec);                       // no results
```

### QuerySpecification

```typescript
new QuerySpecification<Person>()
    .withStatement('MATCH (p:Person {city: $city}) RETURN properties(p)')
    .bind({ city: 'Sydney' })   // named parameters, or a list for $1, $2, …
    .transform(Person)          // map each row to a class
    .filter((it) => it.age >= 18)
    .map((it) => it.firstName)
    .skip(10)
    .limit(10);
```

### Transactions

```typescript
@Injectable()
export class UserService {
    @Transactional()   // join the current transaction, or start one; commit on success, roll back on a throw
    async register(person: Person): Promise<void> {
        await this.people.create(person);
        await this.audit.record(person);
    }
}
```

A transaction spans every database the method touches. A method called outside a request (a job, `onModuleInit`, a
script) starts its own. To run a block in one transaction without a decorator, use
`inDrivineContext().withTransaction().run(async () => …)`; `withTransaction({ rollback: true })` rolls it back
at the end, as tests do.

### Cursors

Stream a large result without holding it in memory:

```typescript
const cursor = await pm.openCursor(new CursorSpecification<Route>().withStatement(statement).batchSize(100).transform(Route));
for await (const route of cursor) {
    // …
}
cursor.asStream().pipe(destination);   // or as a Node stream
```

### Statements in Files

Keep statements in files beside your code, and inject them (Nest), or read them with `cypherStatement(readFileSync(path, 'utf8'))`:

```typescript
constructor(
    @InjectCypher(__dirname, 'routesBetween') readonly routesBetween: CypherStatement,
    @InjectSql(__dirname, 'report') readonly report: SqlStatement
) {}
```

## Supported Engines

The same models, queries and DSL run on each graph store. Switch the engine with `DATABASE_TYPE`.

| Engine | Type | Object manager | Transactions | Search |
|---|---|---|---|---|
| Neo4j 5 | `NEO4J` | yes | full | vector, full-text |
| Memgraph | `MEMGRAPH` | yes | full | vector, text |
| FalkorDB | `FALKORDB` | yes | each statement commits by itself | vector, full-text |
| Oracle 23ai / 26ai | `ORACLE` | yes | full | vector, Oracle Text |
| Amazon Neptune | `NEPTUNE` | no: `PersistenceManager` only | full | no |
| Postgres 14 or later | `POSTGRES` | yes | full | vector (pgvector), full-text |

### Neo4j

The default. Port 7687. `DATABASE_NAME` selects the database, `neo4j` unless given.

### Memgraph

Bolt-compatible, so Drivine runs it on the Neo4j driver; only the Cypher differs. Port 7687, and empty credentials by
default. `CascadeType.DELETE_ORPHAN` isn't available: Memgraph can't use `EXISTS` inside `WITH`.
`removedTargets: DELETE_UNREFERENCED` works.

### FalkorDB

An in-memory graph database on Redis. Port 6379; `DATABASE_NAME` is the graph, `graph` unless given.

**Transactions.** FalkorDB commits each statement by itself. A save is one statement, so it is still atomic, and so is a
`saveAll` of fragments that fits in one. `@Transactional()` methods run, each statement committing as it goes.
`DATABASE_TRANSACTION_MODE` says what to do about that:

- `WARN`, the default: a rollback logs a warning, and so does the first batch of more than one statement, which runs
  statement by statement.
- `STRICT`: starting a transaction throws, so a `@Transactional()` method fails at its first statement, and a batch of more than one statement is refused with `NonAtomicBatchException`
  before any of it runs.

**Map keys.** The FalkorDB client writes parameters into the statement text, and FalkorDB accepts no quoted map key. So
Drivine refuses a parameter map key that isn't a plain identifier, such as a stored name with a `$`, rather than risk
injection.

### Oracle

Oracle Database 23ai or later, through `oracledb` in thin mode. Oracle doesn't speak Cypher: Drivine reads the graph
with SQL/PGQ (`GRAPH_TABLE`) and writes it as rows. Models, the DSL and the object manager are the same as on the graph
engines.

```bash
DATABASE_TYPE=ORACLE
DATABASE_HOST=localhost
DATABASE_PORT=1521          # the default
DATABASE_NAME=FREEPDB1      # the service: required
DATABASE_USER=app
DATABASE_PASSWORD=secret
DATABASE_DEFAULT_GRAPH_PATH=drivine   # names the property graph and its tables; this is the default
```

The graph's name names tables, so it is letters, digits and underscores, begins with a letter, and is at most 114
characters. In code, it is `defaultGraphPath` on the connection's properties, or on the builder:
`DatabaseRegistry.getInstance().builder().withProperties(properties).defaultGraphPath('tenant_a').register('TENANT_A')`.
Two databases over one Oracle service, each naming its own graph, keep apart: each manager reads, writes and indexes
its own graph's tables alone.

**How a graph is stored.** Two tables and a property graph over them, made when a manager first speaks to the graph:
`<graph>_node (nid, labels, props, stamp)` and `<graph>_edge (eid, src, dst, type, props)`, with `labels` and `props`
as JSON. Labels, property names and relationship types are data, so `@NodeLabels`, `@PropertyBag` and `edges` work as
they do elsewhere. A node's stamp is the `stamp` column. A third table, `<graph>_schema`, records the indexes and
constraints Drivine made. The layout is drivine4j's, so the JVM, Node and Python read one store.

Notes:

- A statement you write yourself is SQL. Parameters are named `$name`, as in Cypher. A statement that writes and returns
  rows is a PL/SQL block that hands them back with `DBMS_SQL.RETURN_RESULT`.
- A predicate you write yourself, for a load or a delete, is SQL over the root's row: its `props`, `labels` and `stamp`.
- A save is one block and checks the stamp, as on the graph engines. A save turned away by a deadlock (`ORA-00060`) or
  a serialization failure (`ORA-08177`) is run again. Another writer that changes a node in SQL should give it a new
  stamp: the first sixteen characters of `stamp` for its properties or labels, the last sixteen for its relationships.
- Index the id of each class you save: `uniquenessConstraint('Person', 'id')` makes the unique index a node is found
  by. Without one, a save reads the table.
- Oracle reads an empty string as null, so a comparison with `''` in the DSL is written to find a property stored empty.
- `matches` takes a regular expression in Oracle's POSIX dialect, matched against the whole value.
- A vector index is a table of embeddings beside the nodes, kept in step by a trigger, with an Oracle vector index over
  it by neighbour partitions; `loadNearest` is approximate through it. With no index made, it measures every node of the
  label and is exact.
- A full-text index is a table of the indexed text beside the nodes, with an Oracle Text index over it. `loadMatching`
  reads words, a `"phrase"`, `+must`, `-not` and a `prefix*`. The index holds what has been committed, so a search
  doesn't see its own transaction's writes. Oracle Text is in the regular Free image, not the slim one; without it, or
  with no index made, a search counts the words in the text of every node of the label.

### Amazon Neptune

Neptune connects over Bolt, on `PersistenceManager`: write the statements yourself. Neptune has no `date()` and no list
properties, so store dates as text and annotate lists with `@JsonPacked`.

### Postgres

Postgres 14 or later (tested on 16), as drivine4j states. Postgres keeps a graph in two tables, as Oracle does, read
with joins and written through a function the store keeps.
No extension is needed but pgvector, for vector search, which Drivine makes where the server has it, and pg_trgm,
which a full-text index is made with (it ships with Postgres's contrib modules). Models, the DSL
and the object manager are the same as on the graph engines; `PersistenceManager` runs plain SQL, with cursors and
transactions, as it always has.

```bash
DATABASE_TYPE=POSTGRES
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=app
DATABASE_USER=app
DATABASE_PASSWORD=secret
DATABASE_DEFAULT_GRAPH_PATH=drivine   # names the graph's tables; this is the default
```

The graph's name names tables, so it is letters, digits and underscores, begins with a letter, and is at most 49
characters; Postgres folds it to lower case. The tables are made when an object manager first runs a statement.
Postgres is a graph store like the others, so a schema catalog that names no database applies to it too, and makes its
tables at startup: to keep a database you use only for plain SQL as it is, narrow the catalog with `.forDatabase(...)`.

**How a graph is stored.** drivine4j's store, byte for byte, so the JVM, Node and Python read and write one graph:
`<graph>_node (nid, labels, props, stamp)` and `<graph>_edge (eid, src, dst, type, props)`, with `labels` and `props`
as `jsonb` and a GIN index over the labels, so a node carries any number of them; `<graph>_schema`, the indexes and
constraints Drivine made; and `<graph>_write`, the function a save's steps are carried out by, as one statement that is
applied whole or not at all.

Notes:

- A statement you write yourself is SQL. Parameters are named `$name`, as in Cypher, and a statement is bound only the
  ones it names.
- A predicate you write yourself, for a load or a delete, is SQL over the root's row: its `props`, `labels` and `stamp`,
  e.g. `(n.props ->> 'name') = $name`.
- A number is compared as a number only where one is stored: `'7'` is not `7`, as on the graph engines.
- Text is ordered by the database's collation, so a page of mixed-case text may not be in the order Neo4j gives
  (`a, b, B` rather than `B, a, b`). The range indexes are made in that collation, so an order and a seek are read
  through them.
- A save checks the stamp, as on the graph engines. A save turned away by a serialization failure (`40001`) or a
  deadlock (`40P01`) is run again.
- Index the id of each class you save: a range index or a uniqueness constraint is a partial index over the label's
  nodes, which finds a node by its id.
- `matches` takes a Postgres regular expression, matched against the whole value.
- A vector index is a pgvector HNSW index over the embeddings of the label's nodes of its size; `loadNearest` is
  approximate through it, and exact with no index made. A full-text index is a trigram index over the text a search
  reads, which narrows the search; `loadMatching` scores the same with it and without it, and reads words, a
  `"phrase"`, `+must`, `-not` and a `prefix*`.

## Schema Management (Indexes & Constraints)

Drivine manages range indexes, uniqueness constraints, vector indexes and full-text indexes on Neo4j, Memgraph,
FalkorDB, Oracle and Postgres. `ensure` is idempotent and drift-aware, and the engines' differences (DDL, introspection,
FalkorDB's constraint commands) are handled for you. Declare nothing, and pay nothing.

### Imperative

```typescript
await gom.indexes.ensure(vectorIndex('Proposition', 'embedding', 1536));
await gom.indexes.ensure(rangeIndex('Proposition', 'contextId'));
await gom.indexes.ensure(rangeIndex('Message', ['sessionId', 'createdAt']));   // composite
await gom.indexes.ensure(fullTextIndex('Chunk', 'text'));
await gom.indexes.ensure(fullTextIndex('Entity', ['name', 'description']));
await gom.constraints.ensure(uniquenessConstraint('ChatSession', 'sessionId'));
```

Schema statements run outside any transaction. `ensure` returns a result whose `status` is:

| Status | Meaning |
|---|---|
| `CREATED` | Nothing existed, and the item was made. |
| `ALREADY_MATCHING` | A matching item exists; nothing changed. |
| `DRIFT` | An item exists with a different shape, such as other vector dimensions. Nothing changed: `recreate(spec)` replaces it. |
| `VIOLATION` | Constraints only: the data breaks it. A sample of the values held more than once is included. |
| `RECREATED` | From `recreate(spec)`: the old item dropped and the new one made. |

**Pinning a vector index.** Only the dimensions and similarity are always sent; the rest is the engine's choice, and
engine defaults change between versions. Pin the HNSW shape portably, and anything engine-specific as an engine option:

```typescript
@VectorIndex({ similarity: 'COSINE', hnswM: 32, hnswEfConstruction: 200 }) embedding?: number[];

vectorIndex('Proposition', 'embedding', 1536, 'COSINE', {
    engineOptions: [neo4jVectorOptions({ quantizationEnabled: false }), falkorDbVectorOptions({ efRuntime: 20 })]
});
```

An unpinned parameter is never reported as drift; a pinned one the engine contradicts is.

### Declarative: Decorators

```typescript
@NodeFragment({ labels: ['Proposition'] })
export class PropositionNode {
    @NodeId() @RangeIndex() @Unique() id: string;
    @RangeIndex() contextId: string;
    @VectorIndex({ similarity: 'COSINE' }) embedding?: number[];
    @FullTextIndex() body: string;   // also what loadMatching searches
}

// composite declarations go on the class
@NodeFragment({ labels: ['Message'] })
@RangeIndex({ properties: ['sessionId', 'createdAt'] })
@Unique({ properties: ['sessionId', 'sequence'] })
@FullTextIndex({ properties: ['subject', 'body'] })
export class MessageNode { /* … */ }
```

### Declarative: Catalogs, Enforced at Startup

Give the module a schema, and it is enforced before the application starts, indexes before constraints:

```typescript
DrivineModule.withOptions({
    connectionProviders: [DatabaseRegistry.buildOrResolveFromEnv()],
    schema: {
        catalogs: [
            // vector dimensions come from your embedding model, at run time
            SchemaCatalog.fromFragments(() => embeddings.dimensions, PropositionNode, MessageNode),
            SchemaCatalog.of(rangeIndex('Session', 'lastActivityAt'), uniquenessConstraint('Session', 'id'))
        ]
    }
});
```

Without Nest, enforce the schema yourself before the application serves:

```typescript
await new SchemaManager(graphObjectManagers, { catalogs: [/* … */] }).enforce();
```

Catalogs merge, identical declarations count once, and conflicting ones for the same kind, label and properties fail
startup. A catalog applies to every database that supports schema, unless you narrow it:
`.forDefaultDatabase()`, `.forDatabase('users')` or `.forDatabases('a', 'b')`. A named target is strict: an unknown
database, or one without schema support, fails startup.

| Option | Meaning |
|---|---|
| `mode` | `FAIL_FAST` (the default) throws on drift or a violation; `WARN` logs it and carries on. |
| `recreateOnDrift` | Destructive: replace an item whose shape drifted. |
| `recreateOnStartup` | Destructive: drop and make every declared item on every startup. |
| `violationSampleSize` | How many values held more than once a violation reports; 0 skips the check. Defaults to 10. |
| `enabled` | `false` skips the startup run; `SchemaManager` can still be injected. |

`SchemaManager` is injectable, to change the schema as the application runs: `enforce()` is safe to call again, and
`recreateAll()` drops and remakes every declared item.

### Version-Triggered Rebuild

Drift detection sees only what introspection shows. Swapping an embedding model for another with the same dimensions
leaves stale vectors behind. Tag the catalog with a version, and a new version recreates its items once:

```typescript
SchemaCatalog.of(vectorIndex('Chunk', 'embedding', embeddings.dimensions)).withVersion(embeddings.modelId);
```

The applied version and the items are recorded in a `_DrivineSchema` node for each catalog, in drivine4j's shape. A
first version is adopted without recreating anything. An item recorded but no longer declared is reported, not dropped,
and an item two catalogs declare is never recreated by one of them alone.

> Recreating a vector index rebuilds it from the stored embeddings: it doesn't re-embed. After a model swap, re-embed
> the nodes, then enforce.

### Per-Engine Notes

| | Neo4j | Memgraph | FalkorDB | Oracle | Postgres |
|---|---|---|---|---|---|
| Vector | `CREATE VECTOR INDEX` | `WITH CONFIG`, uSearch metrics | `OPTIONS`, unnamed | A `VECTOR` table beside the nodes, kept by a trigger, with a neighbour-partition vector index | A pgvector HNSW index over the label's embeddings of its size |
| Full-text | `CREATE FULLTEXT INDEX` | `CREATE TEXT INDEX` | per property, unnamed | A text table beside the nodes, with an Oracle Text index | A trigram index over the text a search reads |
| Range | named, composite | label-property | per label | an index over the JSON property | a partial index over the label's nodes |
| Uniqueness | `REQUIRE … IS UNIQUE` | `ASSERT … IS UNIQUE` | `GRAPH.CONSTRAINT`, with its backing index, polled while it builds | a unique index for the label's nodes | a unique partial index over the label's nodes |

Neptune has no schema management.

## Multi-Database Support

Register several connections, and inject each by name:

```typescript
DrivineModule.withOptions({
    connectionProviders: [
        DatabaseRegistry.buildOrResolveFromEnv(),            // DATABASE_*
        DatabaseRegistry.buildOrResolveFromEnv('ANALYTICS')  // ANALYTICS_DATABASE_*
    ]
});

@Injectable()
export class AnalyticsRepository {
    constructor(
        @InjectPersistenceManager('ANALYTICS') readonly pm: PersistenceManager,
        @InjectGraphObjectManager('ANALYTICS') readonly gom: StatelessGraphObjectManager
    ) {}
}
```

Without Nest, register each with `DatabaseRegistry.buildOrResolveFromEnv('ANALYTICS')`, and take its managers by name:
`persistenceManagers.get('ANALYTICS')`, `graphObjectManagers.get('ANALYTICS')`.

One `@Transactional()` method can span several databases.

## Security

Values travel as bind parameters: filter values, saved properties, ids, search vectors and text. Names are written into
the query text, quoted for it: labels, relationship types and property names, which may come from data (a property
bag's keys, open `@NodeLabels`, a property named at runtime, `edges.relate`'s type). A backtick in a name is doubled in
either spelling: Neo4j reads `\u0060` as a backtick even between backticks, so that escape is doubled too. On Oracle
names are escaped for the JSON path and the SQL literal around it, and a graph's name must be letters, digits and
underscores. A raw `QuerySpecification`'s `skip` and `limit` must be whole numbers. Rows are never copied onto an
object under `__proto__`, `constructor` or `prototype`.

What stays yours to guard:

- **A `where` string** (raw Cypher or SQL) is written as it is. Put values in its parameters.
- **`loadMatching` on Neo4j** reads its text as Lucene, which takes wildcards and fuzzy terms that can be slow over a
  large index. Limit what users can send.
- **`matches()`** takes a regular expression: a user's value changes what it matches. Escape it for a literal match.
- **Transport security** is the connection's: on Neo4j and Memgraph use the protocol `bolt+s` or `neo4j+s`
  (`DATABASE_PROTOCOL`). FalkorDB's and Postgres's providers take no TLS options yet.

## Testing

`RunWithDrivine` runs each test of a file in its own transaction, rolled back at its end, so tests leave nothing behind:

```typescript
RunWithDrivine({ rollback: true });

describe('RouteRepository', () => {
    it('finds the fastest route', async () => {
        // …
    });
});
```

FalkorDB has no transactions to roll back: clear what a test wrote yourself.

### Test Containers, or a Local Instance

`@liberation-data/drivine/testing` starts a [Testcontainer](https://node.testcontainers.org) for each datasource your
test environment configures, and points the datasource at it: Neo4j, Memgraph, FalkorDB, Postgres and Oracle. While you
iterate, `USE_LOCAL_<TYPE>=true` uses an instance of your own in that type's place, so nothing starts and you can look at
what a test left behind. It is drivine4j's `@EnableDrivineTestConfig`. Add `testcontainers` to your dev dependencies, and
make it Jest's global setup and teardown:

```typescript
// test/global-setup.ts
import { drivineGlobalSetup } from '@liberation-data/drivine/testing';
require('dotenv').config({ path: '.env.test' });
export default drivineGlobalSetup;

// test/global-teardown.ts
export { drivineGlobalTeardown as default } from '@liberation-data/drivine/testing';
```

```bash
npm test                          # a container for each datasource
USE_LOCAL_NEO4J=true npm test     # Neo4j at DATABASE_HOST:DATABASE_PORT, the others in containers
```

Datasources of one type share a container. `<TYPE>_TEST_IMAGE` picks another image. See
[TEST_CONTAINERS.md](TEST_CONTAINERS.md), which also covers running Drivine's own suite.

## The Sample App

[`sample/`](sample) is the port of drivine4j's sample: an issue tracker and a guide's users, with fragments, views,
relationship fragments, polymorphic users, property bags, stamps and search. `SampleAppModule.forDatabase(name)` wires
Drivine as an application would, and `sample/test` runs drivine4j's sample tests on every store: the DSL, grouped reads,
patches, label polymorphism, required relationships, deletes and search.

[`sample/lambda`](sample/lambda) is the same people and organizations served from an AWS Lambda, with no Nest: see
[Without Nest](#3-without-nest). `sample/lambda/test` invokes its handler on every store, and through its local runner.

## Example Applications

If you use Drivine and your code is public, feel free to make a [PR](https://github.com/liberation-data/drivine/pulls)
and add yourself to the list.

### Quick Start Template

Clone the **[sample app](https://github.com/liberation-data/drivine-inspiration)** and start hacking. It has endpoints
for traffic routing, movies and other typical use cases: choose the one closest to yours, and modify it.

### SlackMap

The new version of [slackmap.com](https://slackmap.com) is a full rewrite: `OrientDB` was replaced with `Neo4j`, through
Drivine, in a full-stack JavaScript app using Angular, Nest and an Nx monorepo.
Repository: [github.com/SlackMap/slackmap](https://github.com/SlackMap/slackmap)

## Documentation

[drivine.org](https://drivine.org/ts/) has this guide a page per section, beside drivine-python's and drivine4j's.

## Tutorials

New to graph databases? Read some tutorials.

* [Rock &amp; Roll Traffic Routing, with Neo4j](https://medium.com/neo4j/rock-n-roll-traffic-routing-with-neo4j-3a4b863c6030)
* [Rock &amp; Roll Traffic Routing, with Neo4j, Chapter Two](https://medium.com/neo4j/rock-n-roll-traffic-routing-with-neo4j-part-2-f2a74fe7d7f)

Have a tutorial you'd like to share? [Get in touch](https://twitter.com/doctor_cerulean).

## Feedback

#### I'm not sure how to do [xyz]

> If you can't find what you need here or in the User Guide, please
> [post a question on StackOverflow](https://stackoverflow.com/questions/tagged/drivine?sort=newest&pageSize=15), using
> the Drivine tag.

#### I've found a bug, or have a feature request

> Please raise a <a href="https://github.com/liberation-data/drivine/issues">GitHub</a> issue.

### Have you seen the light?

Drivine is a non-profit, community-driven project. If you've found it useful, star us on GitHub or send a tweet
mentioning us (<a href="https://twitter.com/@doctor_cerulean">@doctor_cerulean</a>). If you've written a Drivine blog or
tutorial, or published a Drivine-powered app, we'd be happy to hear about that too.

Drivine is led by <a href="https://www.linkedin.com/in/jasper-blues-7781638/">Jasper Blues</a> and sponsored by Jasper
Blues, creator of <a href="https://github.com/appsquickly/typhoon">Typhoon</a>, and
<a href="https://en.wikipedia.org/wiki/Rod_Johnson_(programmer)">Rod Johnson</a>, creator of the Spring Framework and of
<a href="https://hub.embabel.com">Embabel</a>, the AI agent framework for the JVM, which uses Drivine, through drivine4j,
as its graph database client. Contributions come from
<a href="https://github.com/liberation-data/Drivine/graphs/contributors">around the world</a>.

## Building from Source

```bash
npm install
npm run build
npm test         # starts a test container for each engine, needs Docker, and runs the suites in stages
```

The tests' datasources are in `.env.test`. Put overrides in `.env.test.local`, which git ignores: `USE_LOCAL_NEO4J=true`
(or `_MEMGRAPH`, `_FALKORDB`, `_POSTGRES`, `_ORACLE`) to use an instance of your own while you iterate, and
`ORACLE_TESTS=true` to run the Oracle suites too. See [TEST_CONTAINERS.md](TEST_CONTAINERS.md).

## License

Copyright (c) 2022 Jasper Blues

Drivine is free software: you can redistribute it and/or modify it under the terms of the APACHE LICENSE, VERSION 2.0
as published by the Apache Software Foundation, either version 2 of the License, or (at your option) any later version.
This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied
warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the Apache Software License, Version 2.0 for more details.
You should have received a copy of the Apache Software License along with this program.
If not, see <http://www.apache.org/licenses/>.
