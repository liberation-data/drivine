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
connection and every one after it, with a `StoreLayoutError` (exported) that names the graph. Export the graph with
the Drivine version that wrote it, and import it with 6.0, or migrate it in place with `StoreLayoutMigration`, not yet
proven on every store, with a backup taken first. A graph a later Drivine stamped with a later layout is refused too.
See [Oracle](07-supported-engines.md#oracle).

### Values are held as layout 2 holds them

On Oracle, Postgres and SQLite, wherever a save, `patch`, `patchAll` or `edges.relate` writes a value:

- A `Date` is held as a tagged map of its ISO 8601 text and the key it orders by (`{"$t": "datetime", "v": "…", "s":
  "…"}`), where 5.0 held its text. A field declared a `Date` loads it as a `Date`, where 5.0 gave its text (see
  [A property declared a `Date` loads as a `Date`](#a-property-declared-a-date-loads-as-a-date)); any other field
  loads its text, as before.
  On Oracle, Postgres and SQLite the query DSL compares a `Date` by its tag, in a condition, a `seek`, an order, a
  grouped read and a `patch`'s `where`, as Neo4j compares it: its SQL there is the shared compiler's
  ([drivine-cypher-spec#235](https://github.com/liberation-data/drivine-cypher-spec/issues/235)), where it compared the
  date's text and found nothing or the wrong rows. See [Object Manager](05-object-manager.md#operators).
- A raw `where` is still SQL over the node's row `n`: a read of the query DSL calls that row `n_`, and reads `n.name`,
  `n.props`, `n.labels` and `n.stamp` in a raw `where` as that row's. A grouped read's `min` and `max` are the value of
  a node of the group in Cypher's order, of any kind, where 5.0 gave a number's alone; one of a property declared a
  `Date` is a `Date` on every store, FalkorDB included, where FalkorDB gave the date's text
  ([#785](https://github.com/liberation-data/drivine/issues/785)). Its groups are ordered by a key as Cypher orders it, a text before a boolean before a number, where Postgres ordered them as `jsonb` orders, a
  number before a boolean, and Oracle as its JSON orders. `notIn([])` matches a node that lacks the property, as
  Cypher's `NOT n.p IN []` does. On Postgres the query DSL compares and orders text by its code points, as Neo4j does
  (`B, a, b`), where 5.0 used the database's collation (see [Postgres](07-supported-engines.md#postgres)); Oracle did
  so already. On Oracle `matches` reads a backreference as compiled Cypher's `=~` does, and refuses one it can't read
  as Java does, and an equality of an indexed property is read through layout 2's index of the label: a range index's
  labelled index, or a uniqueness constraint's unique index.
- A property or map key whose name begins with `$` is held under one more `$` (`$$k` for `$k`), and reads back as it
  was. The query DSL filters, orders and groups by one as it is held. A raw `where` that names one as Cypher writes it,
  ``n.`$k` ``, reads it as it is held on every SQL store; SQL of your own over `n.props` names it `$$k`.
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
([#696](https://github.com/liberation-data/drivine/issues/696)). As with the values above, nothing is migrated on a
connection. On a 5.0 graph's first connection, where it holds no node of the application, each index under a layout-1 name is
dropped, with the catalog records (`<graph>_schema`) that name it, and the graph is stamped layout 2; the next `ensure`,
`SchemaManager`'s or a manager's, finds no such item and makes it as drivine4j does. A graph that holds the
application's nodes is refused, as above. The schema marker keeps the shape all three libraries read: its inventory
still lists each item, and `ensure` makes again each one it doesn't find.

To see whether a graph holds an index 5.0 made for a range index or a uniqueness constraint, list them by name, the
graph's name in place of `DRIVINE` (5.0's full-text and vector indexes, `drivine_t_…` and `drivine_v_…`, are not
listed here):

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

### A property declared a `Date` loads as a `Date`

On Oracle, Postgres, SQLite and FalkorDB, a field declared a `Date` loads as a `Date`, as it does on Neo4j and Memgraph,
where 5.0 gave the date's ISO 8601 text, so `node.at.getTime()` threw there
([#807](https://github.com/liberation-data/drivine/issues/807)). This holds in a fragment, a view and each relationship
and nested view of it, a relationship fragment, a path's end and a `Date` `@NodeId`. Drivine knows a field is declared a
`Date` where TypeScript records its type, for a decorated field, whatever the decorator, or where the class initializes
it with a `Date`; a field neither decorated nor initialized, or declared `Date | null`, still loads as the store gives
it, and so does a list of dates (`Date[]`). Code that read such a field with `new Date(node.at)` keeps working; code
that compared it with a text, or called a string method on it, now has a `Date`. See
[Object Manager](05-object-manager.md#1-nodefragment-a-node).

A save of an object loaded from Oracle, Postgres or SQLite writes each property it leaves unchanged as the store held it
([#811](https://github.com/liberation-data/drivine/issues/811)), so an undecorated `Date`, which loads as its text, stays
a date. Before, every save path but an `update` of a fragment wrote that text over the date, and a `where` or an order
on the field was silently wrong from then on. An object copied out of a load (a spread, `structuredClone`) isn't
recognised, nor is a date in a property bag, and a new `Date` in an undecorated field can't load back as one: declare
such a field with a decorator. See [Object Manager](05-object-manager.md#1-nodefragment-a-node) for each case.

A node whose `@NodeId` Oracle, Postgres or SQLite holds as a temporal value (Cypher's `date(...)`, a drivine4j `Instant`
id) is refused by name when its class declares the id a `string`, `number`, `bigint` or `boolean`
([#813](https://github.com/liberation-data/drivine/issues/813)). 5.0 loaded it with the id as its text, which a lookup
by id missed, so a save made a second node with that text id, silently. Declare the id a `Date`, or `any`: a save of
either finds the node and writes the id back as the store held it, while the id is unchanged since the load
([#815](https://github.com/liberation-data/drivine/issues/815)), so an `any` id (which loads as the text) and a `Date` id
over a `date`, a `localdatetime`, an offset or a fraction finer than a millisecond round-trip onto their node, where 5.0
made a second one. A new id set through a JS `Date` is still written as a `datetime` at UTC to the millisecond, so a
date-only or offset id can't be made from TypeScript. drivine-python is to refuse a union that would load the id as
text too ([drivine-python#560](https://github.com/liberation-data/drivine-python/issues/560)); TypeScript records a union
as `Object`, as it does `any`, so it never refuses one. See
[Object Manager](05-object-manager.md#loading-data).

### An id given as text is read as the id's type

On Oracle, Postgres and SQLite, `load`, `update`, `patch`, `delete` and `edges` read an id given as text as the
`@NodeId` field's type, as drivine4j does, and compare it as the store's index over the id is made, so the index
answers the lookup. `'6'` finds the node whose number id is 6, where 5.0 compared the property's text and found it, or
a node of the same labels whose id is the text `'6'`; on a `string` id `'6'` finds only the text. Text that is no
value of the type (`'abc'` for a number id) finds no node and runs nothing, and so does a null id: 5.0's `patch` by a
null id could change the node whose id is the text `'null'`
([#773](https://github.com/liberation-data/drivine/issues/773)). See
[Object Manager](05-object-manager.md#loading-data).

### A regular expression on SQLite is Java's

On SQLite, compiled Cypher's `=~` and the query DSL's `matches` read a pattern as Java reads it, with
`UNICODE_CHARACTER_CLASS`, through the shared compiler's matcher, in Node and in the browser bundle alike, as drivine4j
does. 5.0 and earlier read it with JavaScript's `RegExp`, rewritten from Java's: `\w`, `\d` and `\b` were ASCII's, `\s`
was JavaScript's white space, and a class's `&&` was two ampersands, not an intersection
([#560](https://github.com/liberation-data/drivine/issues/560),
[#568](https://github.com/liberation-data/drivine/issues/568),
[#632](https://github.com/liberation-data/drivine/issues/632)). Now `'café' =~ '\\w+'` is true, and
`'c' =~ '[a-z&&b]'` false.

A pattern the matcher can't match exactly as Java does is refused by name now, failing the statement, where V8 took
it: a lookbehind (`(?<=a)b`) and a back reference (`(a)\1`, `\k<name>`) among them (`a lookbehind is not supported on
this platform; rewrite the pattern without it.`). See [SQLite](07-supported-engines.md#sqlite) for the whole list.

### A map is no property in compiled Cypher

On Oracle, Postgres and SQLite, compiled Cypher stores as a property only what Neo4j stores: a number, a text, a truth
value, a temporal value, or a list of one kind of them. A map, or a list of maps or of lists, written as a property in
`CREATE`, `MERGE` or `SET` is refused by name before the statement runs (`A property is a number, a text, a truth value,
a temporal value or a list of them, not a map, as in Neo4j.`). Such a value given as a parameter or an unwound row, or
a list of more than one kind, fails the statement as its row is written, and nothing is stored. 5.0 stored each as a
document ([drivine4j#820](https://github.com/liberation-data/drivine4j/issues/820)). Store such a value as its JSON
text, as a `@JsonPacked` field is stored. See
[Cypher on Oracle and Postgres](07-supported-engines.md#cypher-on-oracle-and-postgres).

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
