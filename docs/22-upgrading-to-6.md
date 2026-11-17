# Upgrading to 6.0

6.0 holds the values of Oracle, Postgres and SQLite in store layout 2, as drivine4j and drivine-python do, and plans
indexes and constraints with the shared compiler's schema planner, as it compiles Cypher. A graph 5.0 wrote with the
application's values in it isn't read, and some of the schema managers' API and results change with the planner,
which is why this is a major version. Neo4j, Memgraph and FalkorDB hold their values as before.

## Breaking changes

### A graph 5.0 wrote is refused where it holds the application's nodes

The provider reads a graph's stamp, its `DrivineStore` node, on its first connection, before anything is made. A
graph 5.0 or earlier wrote, in store layout 1, that holds no node but Drivine's own (its stamp and its schema marker)
has that layout's indexes dropped and is stamped layout 2. One that holds the application's nodes is refused, on that
connection and every one after it, with a `StoreLayoutError` (exported) that names the graph. Nothing is migrated:
export the graph with the Drivine version that wrote it, and import it with 6.0. A graph a later Drivine stamped with
a later layout is refused too. See [Oracle](07-supported-engines.md#oracle).

### Values are held as layout 2 holds them

On Oracle, Postgres and SQLite, wherever a save, `patch`, `patchAll` or `edges.relate` writes a value:

- A `Date` is held as a tagged map of its ISO 8601 text and the key it orders by (`{"$t": "datetime", "v": "…", "s":
  "…"}`), where 5.0 held its text. It reads back as its text, as before.
  The query DSL there refuses a `Date` in a condition, a `seek`, an order expression, a grouped read or a `patch`'s
  `where`, by name, where it compared the date's text and found nothing or the wrong rows; compare dates in a Cypher
  statement until [drivine-cypher-spec#235](https://github.com/liberation-data/drivine-cypher-spec/issues/235). See
  [Object Manager](05-object-manager.md#operators).
- A property or map key whose name begins with `$` is held under one more `$` (`$$k` for `$k`), and reads back as it
  was.
- Each value is held as a `CREATE` given it holds it, written by the shared compiler's module for the store
  ([drivine-cypher-spec#329](https://github.com/liberation-data/drivine-cypher-spec/issues/329)). On Oracle every float
  is a binary double, where 5.0 held it as a `NUMBER`, so a whole float saved read back by Cypher as a whole number. On
  Postgres a whole float (`cypherFloat(2)`) is held with its fraction. A whole number past 2^53, such as 2^60, is held
  with its digits (`1152921504606846976`), as a statement binds it, where 5.0 held JavaScript's shortest text of it
  (`1152921504606847000`).
- A node whose `@NodeId` is a float is found by a load, a delete, `edges.relate` and `loadRelated` by the text the store
  holds it as, as a save finds it: on Postgres and SQLite, 5.0 found none whose id JavaScript writes with an exponent
  (`1e-7`).
- Bytes (a `Uint8Array`, an `Int8Array`, a `Buffer`) are held as the list of their signed values (`[1, 2, -1]` for 1,
  2, 255), a `Float32Array` or a `Float64Array`, such as an embedding, as the list of its numbers, each a float, and
  another typed array as the list of its numbers, where 5.0 wrote a map of indexes.
- NaN and the infinities, where 5.0 wrote null, are held on Oracle, and an infinity on SQLite. Where the store's JSON
  holds no such number, Postgres's NaN and infinities and SQLite's NaN, they are refused at any depth, before anything
  is written, with a `DrivineError` that gives the message a `CREATE` given them is refused with. See
  [Object Manager](05-object-manager.md).

On SQLite a range index or a uniqueness constraint is over a value's kind and key, so a value is equal only to one of
its kind: a uniqueness constraint no longer takes `1` and `'1'` for the same key.

### `withBuild` is gone

`IndexManager.withBuild` and `ConstraintManager.withBuild` are removed, with `IndexBuildOptions`. `gom.indexes` and
`gom.constraints` wait up to 60 seconds for an index Neo4j or FalkorDB builds in the background, as drivine4j's
managers do, and throw for one that failed or did not end in time. `SchemaManager`'s `indexBuildTimeout` and `mode` set
the wait, and what is done with an index not built, for `enforce`, `recreateAll` and `ensure`. `IndexManager` and
`ConstraintManager` are made by the object manager's `indexes` and `constraints`, and their constructors take its
schema planning.

### Schema results

- A uniqueness constraint made again by `gom.constraints.recreate`, or by `SchemaManager.recreateAll`, is `RECREATED`,
  where 5.0 gave `CREATED`.
- `IndexManager.recreate` throws where something other than an index stands under the index's name, and leaves it.
- A constraint the engine refuses for the data is a `VIOLATION` at a `violationSampleSize` of 0 too, with an empty
  sample: the data is still read to confirm it, where 5.0 skipped the read and threw the engine's refusal.
- On Neo4j, a range index over a constraint's label and properties reads as there (`ALREADY_MATCHING`), as in
  drivine4j, where 5.0 read it `CREATED` again.

See [Schema Management](08-schema-management.md).
