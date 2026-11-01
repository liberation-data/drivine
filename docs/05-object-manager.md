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

`@EmptyWhenAbsent` reads the kind of collection from the type TypeScript records for the field: `[]` for an array, an
empty `Set` for a set, and `{}` for an object or a map. A set is stored as a list, and such a field loads it back as
a set.
TypeScript records a list declared with a union, such as `string[] | null` under strict null checks, as `Object`, as it
records a map, so name the kind for such a field, or declare it `tags?: string[]`:

```typescript
@EmptyWhenAbsent({ kind: 'array' }) tags: string[] | null;     // absent loads as [], not {}
@EmptyWhenAbsent({ kind: 'set' }) badges: Set<string> | null;  // absent loads as an empty Set
```

A kind the declared type contradicts, and a field that holds no collection, such as a `string`, are refused when the
model is built.

Storing a set as a list is a change from 3.2, which wrote a set as it was given: Oracle and Postgres held it as `{}`,
and Memgraph as an empty map, without its items. A set field Drivine knows of (see below) loads such a `{}` as an empty
set, and its next save stores it as a list. The refusal of `@EmptyWhenAbsent` on a field that holds no collection is
new too: such a field used to load `{}`.

**Sets.** A field that holds a `Set` loads the list the store holds as a `Set`, with or without `@EmptyWhenAbsent`, in
a fragment, a view or a relationship fragment. Drivine knows a field holds a set where TypeScript records its type as
`Set`, which it does for a decorated field, whatever the decorator, or where the class initializes the field with a
`Set`. A field neither decorated nor initialized leaves no type at run time, and TypeScript records a union, such as
`Set<string> | null`, as `Object`: such a field loads the list as an array. Without `@EmptyWhenAbsent`, a set the node
holds nothing for stays absent, or keeps its initializer, and a stored null loads as null.

```typescript
@GraphProperty('code_set') codes: Set<string>;   // decorated: loads as a Set
badges = new Set<string>();                      // initialized: loads as a Set
tags: Set<string>;                               // neither: TypeScript records nothing, so it loads as an array
```

Loading a set without `@EmptyWhenAbsent` as a `Set` is a change from 3.2, which loaded it as the array the store held.

`save`, `patch`, `patchAll` and `edges.relate` all write a set as the list of its items, and a `@JsonPacked` one as the
JSON text of that list, which is also what a `where` compares a packed set field with. In 3.2, `patch` wrote a packed
set as `{}`, and on Postgres and Oracle so did `patch` and `relate` any set, losing its items; a `where` comparing a
packed field with a set compared it with `{}`, and matched nothing.

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
the same thing everywhere: `(1 + cos) / 2` for a cosine index, from 1 for the same direction down to 0 for the opposite
one, and `1 / (1 + d²)` for a Euclidean index.

**Memgraph's cosine scores changed after 3.2.0 for vectors more than 90 degrees from the query.** Drivine read Memgraph's
`similarity`, which for a cosine index is the absolute value of `1 - distance` (memgraph/memgraph#5199), so a cosine of
-0.6 scored 0.8, as 0.6 does, and opposite vectors scored 1. It now reads the distance, so they score 0.2 and 0, as on
every other store. Scores for a positive cosine, and every Euclidean score, are unchanged.

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

**`topK` bounds the index too.** The scores are scaled over the hits the index yields that have every one of the
root's labels, and each hit is held to do it, so on Neo4j, Memgraph and FalkorDB the index is asked for its best `topK`
hits: a common word that matches most of a corpus costs no more than those. A node with the indexed label alone is no
root, so it is dropped before the scores are scaled, and the best hit a search can return scores 1 on every store.
`threshold` keeps the best hits, so it changes nothing here. A `where`, like a view's required relationships and paths,
or a label beyond the first (the index is over the first), is applied after the index yields; the labels are checked
before the scores are scaled, the rest after. Where any of them filters, the index is asked for
`topK × FULL_TEXT_FILTERED_OVER_FETCH` (10) hits and the filter keeps the best `topK` of those. A filter that passes
fewer than one in ten of the best hits can then return fewer than `topK` while the index holds more that pass it.
Memgraph's index is asked for no more than 1,000,000 hits, however large `topK` is.

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

`eqIgnoreCase` and `containsIgnoreCase` lowercase the property, which no index reads. On a `@CaseInsensitive` field
whose index ignores case, they compare with a lowercased copy instead, which the index serves: see
[Lookups That Ignore Case](#lookups-that-ignore-case).

#### Lookups That Ignore Case

Logging in by email whatever its case is a lookup by `eqIgnoreCase` alone, and on its own it reads every node of the
label. Mark the field `@CaseInsensitive()` and give it an index that ignores case:

```typescript
@NodeFragment({ labels: ['Account'] })
export class Account {
    @NodeId() id: string;
    @CaseInsensitive() @Unique({ ignoreCase: true }) email: string;
}

await gom.loadAll(Account, (q) => ({ where: q.email.eqIgnoreCase('Ada@Example.com') }));
```

- **The copy.** Every save, create, update, `saveAll`, `patch` and `patchAll`, and the save of a view's related nodes,
  writes a lowercased copy of the property beside it, under `__drivine.lower.<property>` (the name it is stored under,
  after `@GraphProperty`). The database lowercases it, as it lowercases the value a lookup compares with, so Drivine,
  drivine4j and drivine-python store and match the same thing. A property with no value has no copy. A load doesn't
  read it, and a flat `@PropertyBag` never holds it. The copy is no part of whether a save changed the node, so a save
  that only fills one in keeps the node's stamp.
- **The index.** `@RangeIndex({ ignoreCase: true })`, `@Unique({ ignoreCase: true })`, `rangeIndex(label, property,
  { ignoreCase: true })` and `uniquenessConstraint(label, property, { ignoreCase: true })` are made over the copy, under
  their own names, `<Label>_<property>_ci_range` and `_ci_unique`. One that ignores case is refused on a field that
  isn't `@CaseInsensitive`, since no save would keep its copy. A uniqueness constraint that ignores case refuses
  `A@x.com` beside `a@x.com`. FalkorDB can't make one: `GRAPH.CONSTRAINT` takes no property name with a dot in it
  ([FalkorDB#551](https://github.com/FalkorDB/FalkorDB/issues/551)), so it is refused there; its range index works.
- **Filling it in.** Ensuring an item that ignores case first fills the copy in on every node of the label that lacks
  it, 10,000 nodes a statement, and records that every node has it: on the store's `DrivineStore` node on the graph
  engines, in the graph's catalog on Oracle and Postgres. An item made anew, or recreated, fills the copies in again.
- **The lookup.** Once the copy is recorded, `eqIgnoreCase` and `containsIgnoreCase` on the field compare with the copy:
  in a load, a count, a `deleteAll`, a grouped read and a patch's condition, on the root's own fields. Until then, and
  for an empty value or a related node's field, they lowercase the property, as for any field: the same answer, without
  the index. A manager knows at once what it recorded, and reads what another recorded at least once a minute.
- **Writes that bypass Drivine.** Cypher or SQL of your own doesn't keep the copy in step. Set it in the same statement
  (`LowerCopies.setClause('a', 'email')` writes the Cypher), or recreate the index.

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

Where Oracle differs: `min` and `max` of a text skip a value stored as `""`, which Oracle reads as no value.

On Oracle and Postgres, a `sum` or an `avg` of decimals is worked out in exact decimal, so it is more accurate:
0.1 + 0.2 is 0.3 there, where doubles give 0.30000000000000004. It differs from a graph engine's only around its 16th
significant digit, and is still a number.

### Saving Data

A save writes what the object holds. It doesn't depend on whether the object was loaded, or on anything the manager
remembers, because the manager remembers nothing.

```typescript
await gom.save(view);                                            // every field that is set; relationships are added, never removed
await gom.save(view, { replace: ['assignedTo'] });               // this field's list is the whole list
await gom.save(view, { replace: 'all' });                        // every relationship field's list is the whole list
await gom.save(chunk, { except: ['embedding'] });                // write everything but these
await gom.save(person, { only: ['name'] });                      // write just these
await gom.save(edited, { from: loaded });                        // checked against the object as it was loaded
await gom.update(Person, id, (it) => { it.name = 'Ada'; });      // load, change, save what differs
await gom.create(person);                                        // make it only if it is not there; undefined when it is
await gom.edges.unrelate(nodeRef(Issue, a), nodeRef(Person, b), 'ASSIGNED_TO');
```

A save is one statement: the root, the relationships it drops, each related node and the relationship to it. It is
applied whole or not at all, with or without a transaction, on every engine.

`only` and `except` name fields of the object, and for a view fields of its root. A view's relationships are written
whatever they name. Give one or the other, not both.

`from` is the object as you loaded it, when what you save is a changed copy of it. The save is then checked against the
stamp `from` carries, whatever stamp the copy carries, as `update` checks against what it loaded. On Neo4j it is also
checked against each field of `from`'s root: see [When a Save Is Refused](#when-a-save-is-refused). It is refused before
anything is written if `from` is the object saved itself, is of another class, has another id, or carries no stamp.
Changed in place, an object no longer says what was loaded: save a copy. A copy of a view may share the root with
`from` when it changes only relationships, but don't change a root it shares in place. `saveAll` takes no `from`.

```typescript
const loaded = (await gom.load(Person, id))!;
// ... later, from what the user changed:
await gom.save(Object.assign(new Person(), loaded, { name: form.name }), { from: loaded });
```

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
  it. FalkorDB has no transactions: see [FalkorDB](07-supported-engines.md#falkordb).
- The objects come back in the order given, carrying the stamps the batch left.
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

An object whose stamp is undefined isn't checked, unless it is saved with `from`: it makes the node or overwrites it.
The save is one statement that takes the node's write lock before it compares, so of several writers holding the same
stamp exactly one succeeds.

**On Neo4j a load can be handed a stamp newer than its data.** Neo4j reads under read committed, without a snapshot, so
a load that runs while another writer commits can find that writer's stamp and the data from before its write. `update`
therefore compares each field of the root as it loaded it too, under the node's lock, and loads again if one differs: a
field's value (a `@JsonPacked` field's as the text the node held), a `@PropertyBag`'s keys and their values, and the
labels a `@NodeLabels` field reads. A field the object doesn't hold and its class doesn't initialize isn't compared. A
`save` checks the same when you give it the object as loaded, as [`from`](#saving-data). A `@JsonPacked` field of a
`from` that a load made is compared as the text the node held; of one that no load made, such as a copy, as a save
packs it, so JSON another writer packed with other spacing has the save refused, though nothing changed. Without
`from` a save has only the stamp to go on, and in that moment it can write over the other writer's change: hold on to
what you loaded and pass it, or change the node with `update`. Where only the stamp makes the round trip, as through a
web form, the stamp is all there is. Memgraph reads from a snapshot, FalkorDB runs no read beside a write, and Oracle
and Postgres read a statement whole, so on them the stamp is what was read.

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
- An object with no stamp, saved without `from`, isn't checked, nor is a fragment in a `saveAll`.
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

Every save skips a `@ReadOnly()` field. Naming it in `replace` is an error, and `replace: 'all'` leaves it alone. A
cascading delete doesn't follow it either, so it leaves the reviewers.

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
await gom.delete(SessionView, sessionId, { cascade: CascadeType.DELETE_ORPHAN });  // and each node nothing outside it needs
await gom.delete(SessionView, sessionId, { cascade: CascadeType.DELETE_ALL });     // and every node in the view
```

The cascade follows the relationships a save of the view writes, through nested views; a node outside the view is never
deleted. So it leaves what a read-only field loads (a `@ReadOnly()` field, a `@GraphPath`, and a list of fragments read
over several hops): other code writes those nodes. A view that contains itself is not read-only, so each of its levels
is deleted. `DELETE_ALL` deletes nodes others may still point at, so use it for nodes the root owns. `DELETE_ORPHAN`
keeps a node in the view that a node outside it still refers to, at any level, together with everything the view holds
below it: a bookmarked message keeps its attachments, and a pinned sub-session keeps its messages and its own
sub-sessions. The rest of the view is deleted, including the session that held a kept message. `DELETE_ORPHAN` isn't
available on Memgraph.

A view that contains itself (`parts: SessionTree[]`, with a `maxDepth`) deletes what a load of it reads: the nodes at
every level, and what each level holds through the view's other relationships a save writes. A cascade never stops
short: if the relationship reaches below its `maxDepth`, the delete throws a `DrivineError` before anything is written,
saying how deep the view reads. Raise the `maxDepth` to cover the deepest level.

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
back every property that no declared field accounts for. A fragment may have one.

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
