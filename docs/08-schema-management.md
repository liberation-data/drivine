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

A uniqueness constraint can name the property its nodes are identified by, for a violation's sample:
`uniquenessConstraint('ChatSession', 'sessionId', { nodeIdProperty: 'id' })`. It plays no part in what is made. A
catalog read from fragments sets it from the `@NodeId`.

Schema statements run outside any transaction. `ensure` returns a result whose `status` is:

| Status | Meaning |
|---|---|
| `CREATED` | Nothing existed, and the item was made. |
| `ALREADY_MATCHING` | A matching item exists; nothing changed. |
| `DRIFT` | An item exists with a different shape, such as other vector dimensions. Nothing changed: `recreate(spec)` replaces it. |
| `VIOLATION` | Constraints only: the data breaks it. A sample of the keys held more than once is included, each its `properties`, the `count` of nodes that hold it, and `nodes`: as many of them as the sample size at most, each its `elementId` (the engine's own id) and the constraint's `nodeIdProperty`. |
| `BLOCKED_BY_INDEX` | Constraints only, on Neo4j: a plain range index over the same label and properties is in the way of it, and is named in `index`. Nothing changed: `ensure(spec, sampleSize, true)` drops the index and makes the constraint, whose own index serves the same lookups. A key held more than once keeps the index, as a `VIOLATION`. |
| `RECREATED` | From `recreate(spec)`: the old item dropped and the new one made. |

A sample size of 0, as in `ensure(spec, 0)`, skips reading the data first, and a constraint the data breaks then throws
the engine's refusal. FalkorDB doesn't refuse one: it builds it in the background and marks the build failed. Drivine then
drops the failed constraint, which enforces nothing, and reads the data: a key held more than once is a `VIOLATION`, as in
drivine4j, with an empty sample at sample size 0. A build that fails with no key held more than once throws. Once the
data is clean, `ensure` makes the constraint. A constraint FalkorDB already lists as failed, or still under
construction (another process's build, or an earlier run's), is not taken as `ALREADY_MATCHING`: one under construction
is waited on, and matches once built, and a failed one is dropped and made again. `drop(spec)` also removes a constraint
FalkorDB failed to build.

A `VIOLATION`'s `sample` is a breaking change from 3.2. Each entry used to be the repeated value itself: one property's
value as it is, or several properties' values as a list. Each entry is now a `ViolatingKey`, and the value is in its
`properties`.

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

A vector index in a catalog over a fragment field that has no `@VectorIndex` fails too, naming the class, the field and
the spec. Without the decorator FalkorDB stores the field as a plain list, and `loadNearest` finds no index for the
fragment. Declare both when a catalog spec tunes the index. The check runs when `SchemaManager` applies the catalog, or
is given the spec by `ensure`, and when the fragment class is first used. A field is matched by the property it's stored
under, on any of the fragment's labels. Only fields the class decorates or initializes can be seen, so
`embedding?: number[]` with neither isn't checked, unless the compiler emits class fields (`useDefineForClassFields`,
the default from target ES2022). A spec for a label no fragment maps, and one given to
`indexes.ensure` directly, aren't checked either.

| Option | Meaning |
|---|---|
| `mode` | `FAIL_FAST` (the default) throws on drift, a violation or an index in the way of a constraint; `WARN` logs it and carries on. |
| `recreateOnDrift` | Destructive: replace an item whose shape drifted. |
| `recreateOnStartup` | Destructive: drop and make every declared item on every startup. |
| `replaceBlockingIndex` | Destructive: drop a plain index in the way of a uniqueness constraint (Neo4j) and make the constraint in its place. |
| `violationSampleSize` | How many keys held more than once a violation reports, and how many of each one's nodes; 0 skips the check, though on FalkorDB a failed build is still checked, and is then a violation with an empty sample. Defaults to 10. |
| `enabled` | `false` skips the startup run; `SchemaManager` can still be injected. |

`SchemaManager` is injectable, to change the schema as the application runs: `enforce()` is safe to call again, and
`recreateAll()` drops and remakes every declared item.

The manager reads its catalogs once, when it is built: a catalog made later isn't seen, and a later `enforce()` applies
the same list. Schema known later is given to `ensure` (below). With nothing to apply, in its catalogs or given to
`ensure`, it says so at info level: `Schema management found no SchemaCatalog` when it was given none, or
`found 2 SchemaCatalog(s), all empty: 'dice', unnamed` when every one came out empty. So a missing index can be traced
to a catalog that never arrived.

### Schema Known Only at Runtime

Some schema can't be in a catalog, because it isn't known when the catalogs are read: a vector index whose dimensions
arrive with an embedding model configured after startup, or an index for each label a tenant declares. Give it to
`ensure`, under the owner it belongs to:

```typescript
await schemaManager.ensure('dice', vectorIndex('Proposition', 'embedding', model.dimensions));
```

With Nest, inject `SchemaManager`. The module provides one only when given `schema`, so an application whose schema is
all known at runtime gives it `schema: { catalogs: [] }`.

The items join what that owner's catalogs declared, for the life of the manager, and are applied as `enforce` applies
the owner's:

- **Under the same options.** `mode`, `recreateOnDrift`, `replaceBlockingIndex` and `violationSampleSize` apply. Only
  the items given are applied, and the results come back by database. `ensure` leaves a change of the owner's version
  to `enforce`, and `recreateOnStartup` doesn't apply to it.
- **In the owner's inventory.** The owner's `_DrivineSchema` marker records them as ensured at runtime. A later
  `enforce()` applies them with the rest, and `recreateAll()` recreates them. An `enforce` by a manager built later (the
  next process, before the item is ensured again) keeps them in the inventory and doesn't report them as orphans.
- **Recreated with the owner.** When that later manager recreates the owner's items (its version changed,
  `recreateOnStartup`, or `recreateAll`), it has no spec for a runtime item, so it marks it, and the next `ensure` of
  the item recreates it.
- **Checked against other owners.** A declaration that conflicts with another owner's, or with the owner's own, fails
  naming both, and nothing is kept or applied on any database. One identical to another owner's is co-owned.

Ensuring an item again with the same kind, label and properties replaces it: of another shape, it's drift. To target
databases, give a catalog: `ensure(SchemaCatalog.of(spec).named('dice').forDatabase('users'))`. A runtime catalog
can't carry a version, since the owner's version is its startup catalogs'. The marker is drivine4j's: either library
keeps what the other ensured at runtime.

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
