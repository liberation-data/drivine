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
  On SQLite and Postgres the query DSL compares a `Date` by its tag, in a condition, a `seek`, an order, a grouped
  read and a `patch`'s `where`, as Neo4j compares it: its SQL there is the shared compiler's
  ([drivine-cypher-spec#235](https://github.com/liberation-data/drivine-cypher-spec/issues/235)). On Oracle it refuses
  a `Date` there by name, where it compared the date's text and found nothing or the wrong rows; compare dates in a
  Cypher statement there until #235 reaches it. See [Object Manager](05-object-manager.md#operators).
- On SQLite and Postgres a raw `where` is still SQL over the node's row `n`: a read of the query DSL calls that row
  `n_`, and reads `n.name`, `n.props`, `n.labels` and `n.stamp` in a raw `where` as that row's. A grouped read's `min`
  and `max` are the value of a node of the group in Cypher's order, of any kind, where 5.0 gave a number's alone, and
  its groups are ordered by a key as Cypher orders it, a text before a boolean before a number, where Postgres ordered
  them as `jsonb` orders, a number before a boolean. `notIn([])` matches a node that lacks the property, as Cypher's
  `NOT n.p IN []` does. On Postgres the query DSL compares and orders text by its code points, as Neo4j does (`B, a,
  b`), where 5.0 used the database's collation (see [Postgres](07-supported-engines.md#postgres)).
- A property or map key whose name begins with `$` is held under one more `$` (`$$k` for `$k`), and reads back as it
  was. On SQLite and Postgres the query DSL filters, orders and groups by one as it is held; on Oracle it doesn't
  yet, and finds nothing by one. A raw `where` that names one as Cypher writes it, ``n.`$k` ``, reads it as it is held
  on every SQL store; SQL of your own over `n.props` names it `$$k`.
- Each value is held as a `CREATE` given it holds it, written by the shared compiler's module for the store
  ([drivine-cypher-spec#329](https://github.com/liberation-data/drivine-cypher-spec/issues/329)). On Oracle every float
  is a binary double, where 5.0 held it as a `NUMBER`, so a whole float saved read back by Cypher as a whole number. On
  Postgres a whole float (`cypherFloat(2)`) is held with its fraction. A whole number past 2^53, such as 2^60, is held
  with its digits (`1152921504606846976`), as a statement binds it, where 5.0 held JavaScript's shortest text of it
  (`1152921504606847000`).
- A node whose `@NodeId` is a float is found by a load, a delete, `edges.relate` and `loadRelated` as the store holds
  it, as a save finds it: on Postgres and SQLite, 5.0 found none whose id JavaScript writes with an exponent (`1e-7`).
- Bytes (a `Uint8Array`, an `Int8Array`, a `Buffer`) are held as the list of their signed values (`[1, 2, -1]` for 1,
  2, 255), a `Float32Array` or a `Float64Array`, such as an embedding, as the list of its numbers, each a float, and
  another typed array as the list of its numbers, where 5.0 wrote a map of indexes.
- NaN and the infinities, where 5.0 wrote null, are held on Oracle, and an infinity on SQLite. Where the store's JSON
  holds no such number, Postgres's NaN and infinities and SQLite's NaN, they are refused at any depth, before anything
  is written, with a `DrivineError` that gives the message a `CREATE` given them is refused with. See
  [Object Manager](05-object-manager.md).

On SQLite a range index or a uniqueness constraint is over a value's kind and key, so a value is equal only to one of
its kind: a uniqueness constraint no longer takes `1` and `'1'` for the same key.

### Oracle's indexes are drivine4j's

On Oracle a range index and a uniqueness constraint are made with the shared compiler's statements, as drivine4j makes
them, byte for byte: over the property's kind and key as layout 2 holds it, and under layout 2's names. For
`rangeIndex('Person', 'name')` that is `drivine_ix2_name_…` over the property of every node and `drivine_lx2_Personname_…`
over the nodes of the label, each column of which is

```sql
CASE WHEN JSON_EXISTS(n.labels, '$[*]?(@ == "Person")') THEN <the kind, or the key, of JSON_VALUE(n.props, '$.name')> END
```

and for `uniquenessConstraint('Person', 'email')`, `drivine_uq2_Personemail_…`, over the label's nodes that have the
property. As on SQLite, a value is equal only to one of its kind. 5.0 made them over an expression of its own, under
layout 1's names (`drivine_ix_…`, `drivine_lx_…`, `drivine_uq_…`):

```sql
CASE WHEN JSON_EXISTS(n.labels, '$?(@ == "Person")') THEN JSON_VALUE(n.props, '$."name"' RETURNING VARCHAR2(4000) NULL ON ERROR) END
```

which the shared compiler's SQL, drivine4j's, never reads through
([#696](https://github.com/liberation-data/drivine/issues/696)). As with the values above, nothing is migrated in
place. On a 5.0 graph's first connection, where it holds no node of the application, each index under a layout-1 name is
dropped, with the catalog records (`<graph>_schema`) that name it, and the graph is stamped layout 2; the next `ensure`,
`SchemaManager`'s or a manager's, finds no such item and makes it as drivine4j does. A graph that holds the
application's nodes is refused, as above. The schema marker keeps the shape all three libraries read: its inventory
still lists each item, and `ensure` makes again each one it doesn't find.

To see whether a graph holds an index 5.0 made, list them by name, the graph's name in place of `DRIVINE`:

```sql
SELECT index_name FROM user_indexes
WHERE table_name = 'DRIVINE_NODE' AND REGEXP_LIKE(index_name, '^DRIVINE_(IX|LX|UQ)_');
```

Where one is there on a graph of layout 2, say one a 5.0 process wrote to after 6.0 stamped it, drop each by hand,
`DROP INDEX <name>`, and the records that name them, as the first connection does; then `ensure` makes what is missing:

```sql
DELETE FROM drivine_schema
WHERE REGEXP_LIKE(UPPER(object_name), '^DRIVINE_(IX|LX|UQ)_')
   OR REGEXP_LIKE(UPPER(JSON_VALUE(details, '$.labelled')), '^DRIVINE_(IX|LX|UQ)_');
```

### An id given as text is read as the id's type

On Oracle, Postgres and SQLite, `load`, `update`, `patch`, `delete` and `edges` read an id given as text as the
`@NodeId` field's type, as drivine4j does, and compare it as the store's index over the id is made, so the index
answers the lookup. `'6'` finds the node whose number id is 6, where 5.0 compared the property's text and found it, or
a node of the same labels whose id is the text `'6'`; on a `string` id `'6'` finds only the text. Text that is no
value of the type (`'abc'` for a number id) finds no node and runs nothing, and so does a null id: 5.0's `patch` by a
null id could change the node whose id is the text `'null'`
([#773](https://github.com/liberation-data/drivine/issues/773)). See
[Object Manager](05-object-manager.md#loading-data).

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
