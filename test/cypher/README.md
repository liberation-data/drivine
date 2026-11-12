# The Cypher spec

These files say what a statement in Drivine's flavour of Cypher gives on each store Drivine runs it on. The graph engines run Cypher themselves. On Postgres, Oracle and SQLite, Drivine compiles it to SQL. The three Drivine libraries (drivine4j, drivine for TypeScript, drivine-python) run the same files, so a statement gives the same rows from each of them.

- `queries.yaml`: statements that read, run over the graph the file's `graph` writes. The graph is emptied and written again before each case.
- `writes.yaml`: statements that write, run from an empty graph. Each case's steps run in turn, so a step reads what the steps before it wrote.
- `temporal.yaml`: openCypher's temporal values (dates, times, moments and durations), run from an empty graph. A graph engine's driver gives a temporal value as a value of its own, and a SQL store gives its ISO text, so the cases read a value's fields.
- `refusals.yaml`: statements each SQL store's compiler refuses, and its message. They are compiled with no store.
- `schema.yaml`: Neo4j's schema commands (`CREATE INDEX`, `CREATE CONSTRAINT`, `DROP …`, `CALL db.awaitIndexes`), and the schema spec a SQL store applies each as, or its refusal. They are read with no store. See [Schema commands](#schema-commands).
- `store.yaml`: the store layout's DDL: the tables, the probe that finds them made, and each index and constraint as each store makes, drops and lists it, for the graph `drivine` and a set of schema specs, with a read for each index that the compiler must answer from it. Read with no store. See [The store layout](#the-store-layout). It also holds the store's schema: how each store's listings are read back, whether an item is a spec's and in its shape, and on a SQL store of which form, what each store can do, and what its errors say. See [The store's schema](#the-stores-schema).
- `marker.yaml`: the schema marker (`_DrivineSchema`) and the stamps: the statements each store reads and writes the marker and the store's stamp (`DrivineStore`) with, the marker's inventory as it is written and read back, the version token, and the form of the stamp each node carries. Read with no store. See [The schema marker and the stamps](#the-schema-marker-and-the-stamps).
- `plans.yaml`: the schema plan: what a schema manager runs on each store, round by round, for an enforce, a recreate, an ensure or a remove, what the store answers, and what the manager reports, its log lines among it. Read with no store. See [The schema plan](#the-schema-plan).
- `host.yaml`: what each library's own code does with the values compiled SQL hands it: the functions it registers on SQLite, and how it reads a column of a statement's rows. Read with no store. See [Host functions and readers](#host-functions-and-readers).
- `search.yaml`: full-text search: the nodes a search finds on each store, over the graph the file's `graph` writes, and how closely each other store ranks a corpus, `search/docs-corpus.json`, as Neo4j's full-text index ranks it. See [Full-text search](#full-text-search).
- `results.yaml`: a statement's columns, and its values with their kinds kept, a node with its labels and a relationship with its type, as each library's call that gives them reads them (drivine4j#741), over the graph the file's `graph` writes. See [Columns and typed values](#columns-and-typed-values).
- `cli/`: the `drivine` CLI's contract, which runs Cypher on every store and prints its results as cypher-shell does, and `cli.yaml`, the cases each build of it runs. See `cli/README.md`.
- `model/`: the model file each library writes of an application's fragments, views and how they are stored, which Drivine Studio reads. See `model/README.md`.

A runner empties the whole graph before each case, not just the nodes that carry the file's `label`. The statements match plain labels, such as `MATCH (p:Person)`, so a node another test left behind would show up in their rows.

## A case

```yaml
- name: "Optional match"
  description: "OPTIONAL MATCH keeps the row, with null where it finds nothing."
  steps:
    - cypher: "MATCH (p:Person) OPTIONAL MATCH (p)-[:KNOWS]->(f) RETURN p.name, f.name ORDER BY p.name"
      rows: [["Carrie", null], ["Hugo", null], ["Keanu", "Carrie"], ["Laurence", "Keanu"]]
```

A case has a short `name`, unique in its file, that a library's runner shows and skips by, and a one-line `description` of what it checks. Then its steps, run in turn.

A step has:

| Key | What it is |
|---|---|
| `cypher` | The statement. |
| `parameters` | The values bound to its parameters. |
| `rows` | The rows it gives. A row of one column is its value, and a row of several is a list of their values, as `PersistenceManager.query` gives them. |
| `error` | The message it fails with, a list of messages any one of which passes, or `true` for a failure of any message. |
| `only`, `except` | The stores the step runs on, or doesn't. A store is `neo4j`, `memgraph`, `falkordb`, `neptune`, `postgres`, `oracle` or `sqlite`. The group `graph` names the graph engines, and `sql` names the stores Cypher is compiled for. |
| `unordered` | The rows are compared in any order. |
| `unorderedLists` | Each list within the rows is compared in any order. |
| `keyOrder` | Each map's keys are compared in order too. |
| `note` | Why the step is there. It is not read. |

A step with no `rows` and no `error` is run, and what it gives is not checked.

On Neo4j a statement runs in the database's default language, Cypher 25 on Neo4j 2026.10. A step that pins what Cypher 5 gives, where the two differ, starts its statement with `CYPHER 5` and runs `only: [neo4j]`.

## Values

- A whole number and the same number written with a fraction are different values: `2` is not `2.0`.
- `{$repeat: "x", times: 3000}` is the text `x` written 3000 times, in parameters and rows alike.
- `{$float: "NaN"}`, `{$float: "Infinity"}` and `{$float: "-Infinity"}` are NaN and the infinities, in parameters and rows alike: not every YAML parser reads `.nan` and `.inf`. NaN in the rows is the same as NaN there.
- Any other map is the map it is, even one keyed with `$`, such as `{$numberDouble: "1"}`.
- Quote every string. A YAML 1.1 parser, such as SnakeYAML or PyYAML, reads a bare `y`, `yes`, `no` or `on` as a boolean.
- `writes.yaml` binds and expects a whole number beyond 2^53. A library whose language reads YAML numbers as doubles skips those steps, named in its own runner. Otherwise a library skips nothing: a store that differs says so with `except` here.

## Columns and typed values

`results.yaml` is run through each library's call that gives a result's columns and its values with their kinds kept, not through `PersistenceManager.query`. A library that has no such call yet doesn't run it. Its cases are as `queries.yaml`'s, and each step has `columns` too: the result's column names, in order, as a graph engine names them, given for a result with no rows too, and empty for a statement that returns nothing. A row of one column is still its value, and a row of several a list of them.

In its rows:

- `{$t: "node", labels: […], properties: {…}}` is a node, with its labels in any order;
- `{$t: "relationship", type: "…", properties: {…}}` is a relationship;
- `{$t: "path", nodes: […], relationships: […]}` is a path, its nodes and relationships in the order it walks them;
- `{$map: {…}}` is the map it holds, for a map with a `$t` key of its own.

On a SQL store, the compiler gives the columns, and compiled typed (`typed`) it tags each node and relationship as above in the columns that hold them: see the compiler's README. It is opt-in, and untyped every statement compiles as before.

## Schema commands

A SQL store runs Neo4j's schema DDL through its library's schema machinery: a `CREATE` is ensured as the schema API ensures a spec, under an owner of its own, `ddl`, so the item has the name, the expressions and the inventory entry the API gives it. `writes.yaml` runs such statements on Neo4j and the SQL stores alike. `schema.yaml` pins how each library reads one, with no store:

```yaml
- name: "Range index"
  description: "CREATE [RANGE] INDEX over one property or several is a range index."
  steps:
    - ddl: "CREATE INDEX person_name IF NOT EXISTS FOR (p:Person) ON (p.name)"
      create: {kind: "RANGE_INDEX", label: "Person", properties: ["name"], alias: "person_name", ifNotExists: true}
```

A step has `ddl`, the statement, an optional `note`, and one of these, which says what it reads as:

| Key | What it reads as |
|---|---|
| `create` | A spec to create: its `kind` (`RANGE_INDEX`, `UNIQUENESS_CONSTRAINT`, `FULLTEXT_INDEX`, `VECTOR_INDEX` or `TEXT_INDEX`, as a store's catalog names it), `label` and `properties`; `alias`, the statement's name where it is not the name the schema API gives the spec; `ifNotExists`; and `options`: a full-text index's `analyzer`, and a vector index's `dimensions`, `similarity` (`COSINE` or `EUCLIDEAN`), `hnswM`, `hnswEfConstruction` and `quantizationEnabled`. A key left out is null, false or empty. The spec itself has no name: the schema API's is the one it is made under, and the alias is kept beside it, so that a `DROP` by it finds the item. |
| `drop` | A drop of the item by its name: `kind` (`INDEX` or `CONSTRAINT`), `name`, and `ifExists`. |
| `await` | `true`: a wait for indexes, which does nothing on a SQL store. |
| `reserved` | Drivine's own uniqueness constraint, of the schema marker's `scope` or the store stamp's `key`, by any name: its `label` and `properties`. It is made as the library makes it for itself, and recorded in no owner's inventory. |
| `cypher` | `true`: not a schema command, but Cypher, compiled as any other statement. |
| `error` | The message it is refused with. A SQL store's compiler refuses it with the same message (see `refusals.yaml`). |

## The store layout

Each library makes the same tables, indexes and constraints on a SQL store, and the same schema statements on a graph engine, so a store one library made is read alike by another. `store.yaml` pins them: drivine4j's statements, the reference, as its schema grammars gave them when they were captured, for the graph `drivine`. The compiler's module (`compiler/`, `org.drivine.cypher.store.ddl`) writes them, and its tests check it gives these, byte for byte, on every target.

```yaml
graph: "drivine"
tables:
  postgres: {ddl: [...], ensuring: "DO $ensure$ ..."}
  oracle: {ddl: [...], functions: [...], ensuring: "DECLARE ..."}
  sqlite: {ddl: [...], made: "SELECT CASE WHEN ...", file: "SELECT file FROM pragma_database_list ..."}
catalog: {item: {...}, aliases: [...], stores: {postgres: {indexes: {RANGE_INDEX: "...", ...}, constraints: "...", aliased: "...", unaliased: "..."}, ...}}
names:
  - {store: "postgres", graph: "drivine", kind: "ix", parts: ["Person", "name"], name: "drivine_ix_Personname_44ce5436"}
refusals:
  - {store: "postgres", graph: "1graph", refusal: "'1graph' cannot name a graph on Postgres: ..."}
cases:
  - name: "Range index"
    description: "A range index over one property."
    spec: {kind: "RANGE_INDEX", label: "Person", properties: ["name"]}
    stores:
      postgres:
        create: ["CREATE INDEX IF NOT EXISTS drivine_ix_Personname_44ce5436 ON drivine_node (((props ->> 'name'))) WHERE labels @> '[\"Person\"]'", "INSERT INTO drivine_schema ..."]
        drop: ["DO $forget$ ..."]
      neo4j:
        create: ["CREATE INDEX `Person_name_range` IF NOT EXISTS FOR (n:`Person`) ON (n.`name`)"]
        drop: ["DROP INDEX `Person_name_range` IF EXISTS"]
        dropUnnamed: {error: "Cannot drop index on Person[name]: ..."}
    read:
      cypher: "MATCH (n:Person {name: $x}) RETURN n"
      parameters: {x: "Ada"}
      indexedProperties: [["Person", "name"]]
      holds:
        postgres: ["(props ->> 'name')", "labels @> '[\"Person\"]'"]
```

| Key | What it is |
|---|---|
| `tables` | What makes each SQL store's tables, base indexes and functions (`ddl`, and Oracle's `functions`), each statement safe to run again, and how a library finds them made. On Postgres, `ensuring` is one block: the probe of the node table's comment, which holds the version token (`drivine:7`), the graph's advisory lock, and the `ddl`. On Oracle, `ensuring` probes the property graph's `doc` property and each function, and makes what is missing. On SQLite, `made` counts what of the `ddl` is there, or is -1 for tables made without `AUTOINCREMENT`, and `file` names the database's file. |
| `catalog` | Each store's queries that list its indexes of each kind and its constraints; on a SQL store, the statements that set and take away the `aliases` of the record of `item`, and `formRecorded`, the one that records its record's form (see [Forms](#the-stores-schema)); and Oracle's `labelled`, the labelled indexes a library tells the compiler of as `indexedProperties`. On a SQL store a listing of range indexes or of constraints, and on Postgres and Oracle one of vector or full-text indexes, gives, after the records, a row for each object under a name Drivine gives that kind's objects (see [Forms](#the-stores-schema)). |
| `names` | The name a SQL store gives an object of `kind` made for `parts`, a label and properties, for a `graph`: `<graph>_<kind>_<readable>_<hash>`. `readable` is the parts' ASCII letters and digits run together, cut to at most 40 and to what leaves room, within the store's longest name (63 on Postgres and SQLite, 128 on Oracle), for the rest and a `_t`. `hash` is Java's `String.hashCode` of the parts joined by U+0000, over their UTF-16 code units, as `Integer.toHexString` writes it: unsigned, in lower case, with no leading zeros (`drivine_ix_name_337a8b`). |
| `refusals` | Why a store refuses a graph's name, or null where it takes it. |
| `cases` | An index or a constraint: its `spec`, as `schema.yaml` writes one, with `ignoreCase` and the engines' vector options (`quantizationEnabled`, Neo4j's; `efRuntime`, FalkorDB's) among its `options`. A spec that ignores case is made over the lowercased copies of its properties, under a name of its own, as the schema API makes it. `existing` is what the store has of the same kind on the label already, which only FalkorDB reads. |

Each case's `stores` hold, for `postgres`, `oracle`, `sqlite`, `neo4j`, `memgraph` and `falkordb`, what makes the item (`create`), and on a SQL store the `form` its record says it is made in, with the `digest` of its `create`: SHA-256 of the statements' UTF-8, each after the first behind U+0000. A change to what a `create` makes is a new form, so its record tells it apart from an item made before: the module's `SqlStoreDdl.CURRENT_FORM` goes up, and every case's `form` with it. A test fails where a `create` changes and its `form` doesn't. The form is `1`, drivine4j's DDL as it was pinned when records began to say their form. Then what drops it by its name (`drop`), and, where it differs, what drops it with no name known (`dropUnnamed`). A uniqueness constraint's SQL stores have `recreate` too, what makes it again in its place so that data it refuses leaves it the index it had (drivine-cypher-spec#135 §4): `leftover`, which drops the unique index a recreate that stopped short left under the name it builds under first, the constraint's index's name and `_r` (`SqlStoreDdl.temporaryName`; at the longest a graph's name may be, a `uq` name is one character too long for that, and its last is cut); `build`, the create's unique index under that name, without its `IF NOT EXISTS`, while the old one stands (on Oracle within the block that waits out another session's lock); `swap`, which puts it in the old one's place (Postgres: one block that drops the old and renames it; Oracle: the drop, then the rename; SQLite, which renames no index: the drop, the create's index made again under its name, which the data, held unique by the one just built, can't refuse, then the one built first dropped); `finish`, which puts the one built first in its place where a recreate was cut off after the old index was dropped (the rename; on SQLite the index made again under its name and the one built first dropped); and `remade`, which, after the create runs again and finds the index made, records the record as made in the current form as the index under its name, under the item's name, keeping its aliases, as a record made anew would be. The old index the swap drops is the one under the name this version gives it, not one its record names otherwise: the three libraries name it alike. Its `form` and `digest` (of `leftover`, `build`, `swap`, `finish`, then `remade`) are a create's: what it leaves is the index the create makes, so it is of the create's form. Each is a list of statements, or `{error}`, the message the store refuses it with. A statement is its text, or on FalkorDB `{native: [...]}`, a command of its driver (`GRAPH.CONSTRAINT`), where `{graphName}` stands for the graph. A constraint's `falkordb` has `constrainable`, `{error}`, where FalkorDB refuses it before its `create`: `GRAPH.CONSTRAINT` takes only a plain name for a property. On a SQL store, a `create` follows the statements that make the store, which the case leaves out: Postgres's and Oracle's `ensuring`, and SQLite's `ddl`. On Oracle, each index a `create` builds over the node table, the range index over every node's property, the labelled index and the unique index, is run within a PL/SQL block that runs it again a tenth of a second after another session's lock turns it away (`ORA-00054`), for up to 300 tries, and then raises, as `ensuring` runs its statements: Oracle's DDL does not wait for a lock, and libraries starting together each make the store stamp's key constraint (liberation-data/drivine4j#517). An index another session made after the block's `IF NOT EXISTS` found none (`ORA-00955`) is taken as made, as `ensuring` takes it.

**Reads.** A range index and a uniqueness constraint are only worth their DDL if a statement is read through them, so each such case has a `read`: a statement, its `parameters`, and the `indexedProperties` a library gives the compiler on Oracle. Compiled on each SQL store, its SQL holds each of `holds`, the expressions the index is made over as its `create` writes them, with each column a statement reads of the node, `props`, `labels` or `stamp`, as its alias's (Oracle's index names them as `n`'s). A runner checks each expression is in the case's `create`, as it is or within a PL/SQL literal, quotes doubled, and that the compiled SQL tests it where a planner reads an index by it: as a conjunct of its `WHERE`, a label's test, or as the left side of a conjunct's `=`, and not only within a `CASE` or beside an `OR`. A vector and a full-text index have none: their searches are each library's, not compiled Cypher.

## The store's schema

A schema manager reads what a store has before it makes anything, and decides from what the store says: whether an item it found is the one a spec declares, whether it has the shape the spec declares, and what an error means. Each library decides alike, so a store one library made is ensured alike by another. `store.yaml`'s sections `schema`, `listings`, `matching`, `errors` and `declarations` pin drivine4j's decisions, the reference, as its schema grammars made them when they were captured, with no store. The compiler's module (`org.drivine.cypher.store.schema`, and `SchemaItemInfo`, `EnsureResult`, `SchemaPolicy`, `SchemaMode` and `SchemaDeclarations` in `org.drivine.schema`) makes them, and its tests check it gives these on every target. The listings' statements are the `catalog`'s, pinned once; what this pins is how their rows are read.

They are in `store.yaml`, and not a file of their own, because they read what `store.yaml`'s statements make and list: a listing's rows are the rows of its `catalog` queries, and an item is matched against the spec its `cases` make. `marker.yaml` is a file of its own because the marker is a contract apart from the DDL; this is not.

```yaml
schema:
  stores:
    neo4j: {engine: "Neo4j", supportsIfNotExists: true, supportsNamedItems: true, supportsTextIndex: true, constraintsRequireBackingIndex: false, constraintCreationIsAsync: false, indexOperationsAreAsync: false, awaitIndex: "CALL db.awaitIndex($name, $timeout)", indexState: "SHOW INDEXES ..."}
  tuning:
    - {spec: {...}, stores: {neo4j: [], memgraph: ["hnswM"], ...}}
  samples:
    - {spec: {kind: "UNIQUENESS_CONSTRAINT", label: "Person", properties: ["email"]}, limit: 10, stores: {neo4j: "MATCH (n:Person) ...", neo4j4: "...", postgres: "SELECT jsonb_build_object(...", ...}}
listings:
  - name: "SHOW INDEX INFO: range, composite, label-only, a vector's backing, and text indexes"
    listing: "indexes"
    rows: [["label+property", "Proposition", "contextId", 0], ...]
    stores: {memgraph: {items: [{kind: "RANGE_INDEX", label: "Proposition", properties: ["contextId"]}, ...], aliases: [[], ...]}}
matching:
  pairs:
    - {name: "...", existing: {kind: "RANGE_INDEX", label: "Person", properties: ["born", "name"]}, spec: {...}, stores: {neo4j: {identity: true, shape: true}, ...}}
  incomplete: [{item: {...}, stores: {oracle: true, ...}}]
  builds: [{status: "UNDER CONSTRUCTION", buildFailed: false, buildInProgress: true}]
errors:
  - name: "Oracle: ORA-01452, a unique index over rows that repeat a key"
    causes: [{sqlState: "72000", vendorCode: 1452, message: "ORA-01452: cannot CREATE UNIQUE INDEX; duplicate keys found"}]
    stores: {oracle: {violation: true, blockedByIndex: false, buildTimeout: false}, ...}
declarations:
  - {name: "...", specs: [...], items: [...]}
  - {name: "...", specs: [...], conflict: "Conflicting schema declarations for ..."}
```

A spec is written as `cases` write one, with a constraint's `nodeIdProperty`, the property a violation's sample names each node by, beside. A schema manager hands every rule a spec as it is made, as drivine4j's do: one that ignores case over the lowercased copies of its properties, so that its item is found, matched and sampled over them, not over the properties declared. An item, what a store has, is its `kind`, `label` and `properties`, and what the store gives of its `name`, `dimensions`, `similarity`, `analyzer`, `status`, `quantizationEnabled`, `hnswM` and `hnswEfConstruction`; a key left out is null, a value the store doesn't give.

| Key | What it is |
|---|---|
| `schema.stores` | What each store can do. `supportsIfNotExists`: its DDL takes `IF NOT EXISTS`, and where it doesn't, an item is found before it is made or dropped. `supportsNamedItems`: it keeps an item's name. `supportsTextIndex`: it has Neo4j's TEXT index, which is refused elsewhere. `constraintsRequireBackingIndex`: a uniqueness constraint needs a range index over its properties made first. `constraintCreationIsAsync` and `indexOperationsAreAsync`: a create or drop returns before it is done, and the listing is polled until it is (a constraint `OPERATIONAL` or `FAILED`, an index no longer being built, or gone). `awaitIndex`: what waits for an index named `$name` to be built, for `$timeout` whole seconds, after it is made; and `indexState`: what gives its `state`, read when that wait fails for another reason than its timeout. |
| `schema.tuning` | What a vector spec pins that each store can't make, named as the spec names it, for a library to warn of. |
| `schema.samples` | What samples the keys that repeat for a uniqueness constraint, `limit` of them at most, with `limit` of the nodes of each: each row `{properties, count, nodes}`, each node its `elementId` and, where the spec has one that isn't a key, its `nodeIdProperty`. `neo4j4` is Neo4j 4's, which names a node by `id(n)`, not `elementId(n)`. One `refilled` samples a constraint that ignores case, given as declared, its keys read as its properties lowercased as the copies are filled in (`lower`, `LOWER`, SQLite's `drivine_lower`) rather than as its copies: what a refill the old index refused would have written. |
| `listings` | A listing's `rows`, as a driver gives them, and for each store that reads them the `items` they read as, in order, and the `aliases` each item's record keeps, the other names it goes by; or `invalid: true`, where the store refuses them. `listing` says which of the `catalog`'s queries gave them: `indexes` or `constraints`. |
| `matching.pairs` | An item a store has and a spec, and on each store whether the item is the spec's (`identity`), and if so whether it has the spec's shape (`shape`); an item that is the spec's but not in its shape is drift. |
| `matching.incomplete` | Whether each store makes an item it listed again, as one that lacks part of what it makes. |
| `matching.builds` | What a listed item's `status` says of its build, on a store that builds after the statement returns: `buildFailed`, and `buildInProgress`. |
| `errors` | A failure's `causes`, the chain of errors from the outermost in, and on each store whether it says the data violates a uniqueness constraint being made (`violation`), that a range index is in the way of the constraint (`blockedByIndex`), that a wait for an index ran out (`buildTimeout`), or that an index over the same expressions is there already, so a unique index built anew can't stand beside the old one (`alreadyIndexed`, Oracle's `ORA-01408`). |
| `declarations` | An owner's `specs`, in the order declared, and the `items` they make, or the `conflict` they are refused with. |
| `forms` | A SQL store's listing (`store`, and `listing`, which of its `catalog`'s queries), its `rows` as the store gave them, captured from the store, `listed`, the items its records read as, its objects' rows left out, and for each of `items`, a `spec`, the `form` the rows say its item is of: `current`; `{stale: <found>}`; `{newer: <n>}`, the later form its record says; `{unrecorded: <statement>}`, the statement that records its form; or `{mismatch: {name, reason, droppable}}`. |

**A cause.** Each error of the chain is written as a library's driver gives it. A SQL driver's error gives its `sqlState`, and its `vendorCode`, the driver's own number, `0` where it gives none; a Neo4j driver's error, which Memgraph's are too, gives its `code`, `N/A` where it gives none, as drivine4j's driver does, and its `gqlStatus`; every error gives its `message`, and any other error only that. A `vendorCode` or a `sqlState` is what says an error is a SQL driver's, and a `code` that it's a Neo4j driver's. drivine4j's Neo4j driver gives the status `50N42` to an error a server sent none for, and a library whose driver gives none reads it as `50N42`.

**Identity.** An item is a spec's when its kind and label are the spec's, and its properties are the spec's in any order. On FalkorDB, which keeps one range index and one full-text index for a label over all its properties, a range or full-text item is the spec's when it holds all the spec's properties, with or without others.

**Shape.** A vector index is in its spec's shape when its `dimensions` are the spec's, always compared, so an index whose size isn't given is drift; and when its `similarity`, `hnswM` and `hnswEfConstruction` are the spec's, each where the store gives one and the spec pins one (the store's own options for these win on that store); and on Neo4j, its `quantizationEnabled`, by the same rule. FalkorDB's `efRuntime` is never compared. A full-text index is in its shape when the spec asks for no analyzer, the store gives none, or they are the same. Every other kind is always in its shape.

**Listings.** A row is what the listing's statement gives as one: the value of its one column, a map (a SQL store's JSON, decoded), or, where it gives several columns (Memgraph's `SHOW INDEX INFO`), the list of them. A number is handed over as a number, whatever type the driver gives it as (a JavaScript Neo4j driver's `Integer` too), and read as its whole part, `8.0` as `8`. Neo4j's listing gives a map a row: a relationship's index or constraint is passed over, and a type it doesn't manage (`LOOKUP`, `POINT`); `BTREE` is a range index; a uniqueness constraint is any type that holds `UNIQUENESS`; its similarity is read in any case, and one it doesn't know is null; quantization is `vector.quantization.type` other than `NONE`, in any case, where it is given, and `vector.quantization.enabled` where it is not. Memgraph's gives a vector index as a map and the rest as lists of columns, and a label with or without a leading `:`. FalkorDB's gives a row a label, and its range properties are one item, its full-text properties another, and each vector property an item of its own, each with the row's `status`; a vector's options are the options of its property where they hold the `dimension`, or else the row's options where those hold it, or else the options of its property. A SQL store's gives a record a row, and after the records, where its listing names objects, a row for each object under a name Drivine gives (`object`, its name), which is read for an item's form and is no item; Oracle's alone gives a `status`, `INCOMPLETE` for a range index that lacks its labelled index, which is made again.

**Forms.** Each record the module writes says the form its item was made in, `"form": 1` first in its `details`. A form is how a version, or a library, writes an item's DDL: the same item, of the same kind, label, properties and uniqueness, made with other expressions. Drivine for TypeScript and drivine-python made Oracle's labelled and unique indexes with other expressions than drivine4j's, under the same names (a label tested as `'$?(@ == "L")'`, a property read as `'$."p"'`, `RETURNING VARCHAR2(4000) NULL ON ERROR`; drivine4j's as `'$[*]?(@ == "L")'` and `'$.p'`), and on Postgres and SQLite the three made every item byte for byte alike. So a schema manager reads an item's form (`StoreSchema.formOf`) from its record and what the store has under its names:

- First, each object the store has under a name Drivine gives one of the item's must be the one the item is made as: an index, on the node table, unique where the item is a uniqueness constraint and not where it isn't, over the item's properties in order, and over the nodes of its label alone, or of every node for Oracle's index over the property of every node (`ix`). Where it isn't, the item is a mismatch, whatever its record says. On Postgres and SQLite the names are a range index's (`ix`) and a uniqueness constraint's (`uq`); on Oracle, a range index's `ix` and labelled `lx`, and a constraint's `uq` and the `ix` it makes too. On Postgres a vector index (`v`) must also be HNSW, with the operator class of its similarity (`vector_cosine_ops`, `vector_l2_ops`), over the embedding of its property, of its size; and a full-text index (`t`) GIN, with `gin_trgm_ops`, over the text of its properties in order. On Oracle a vector or a full-text index is a table beside the nodes (`v`, `t`), its trigger (`…_t`) and its index (`…_i`): the table must hold its column (`EMBEDDING`, a `VECTOR`; `DOC`, `JSON`), the trigger must be on the node table, test no label but the item's, and read the item's properties, in order, and no others (one that tests a label neither library's way, or none, is not told apart by it), and the index must be of its type (`VECTOR`; Oracle Text's `DOMAIN`) on the table. SQLite makes no object for either: only their records say their form. An object that isn't there is no mismatch: the listing leaves out a record whose object is gone, and Oracle lists a range index that lacks its labelled index `INCOMPLETE`. An `INCOMPLETE` range index of another form, stale or newer, is not made whole: the module holds only this version's DDL, and would complete it in this version's form, which a stale or a newer item never is here. It is kept, `AlreadyMatching`, with its form's line at `WARN`, and a recreate makes it whole.
- Then the record: a form equal to the current one is current, an earlier one is stale, and a later one (`form 2`, written by a newer version during a rolling deploy) is a newer version's: kept and used as it is, said so once at `WARN` (`… was made by a newer version of Drivine (form 2; this version makes form 1): this version uses it as it is.`), with no recreate, as this version would make it again in an older form, and never a problem. A newer form's record is trusted so long as the structure fits: its expressions, which this version may not read, aren't compared, and only that it is an index, on the node table, as unique as the item, by its access method, is; so an older version in a rolling deploy never drops a newer one's index, nor reports it drift. On Oracle a newer vector or full-text index's index over its table beside the nodes must be of its type (`VECTOR`; `DOMAIN`), on that table, and its table's columns and its trigger's text aren't read. A name a non-index holds, or an index of the wrong uniqueness, is still a mismatch. A record with no form is current on Postgres and SQLite. On Oracle a vector's or a full-text index's is read from its trigger's text, as each library wrote it: a label tested by its text (`INSTR(… ',"Chunk","')`) is drivine4j's, and its form is recorded; by a path (`JSON_EXISTS(:NEW.labels, '$?(@ == "Chunk")')`), TypeScript's or Python's, which is stale; a label tested neither way, or none, or no trigger, is taken as current. Any other item's is read from its labelled or unique index: drivine4j's expressions are the current form, which is then recorded (`formRecorded`, which touches nothing else and is safe to run again); TypeScript's or Python's are stale; and anything else, or an item with neither index (a range index a uniqueness constraint's index serves), is taken as current.

On Oracle the objects that decide an unrecorded form are a range index's labelled index (`lx`), a uniqueness constraint's unique index (`uq`), and a vector's or a full-text index's trigger (`…_t`); the index over the property of every node (`ix`) decides nothing, as TypeScript and Python write it in drivine4j's text, so a range index left with only it is current, and made whole in this version's form. The same reading is made of objects under an item's names that no record names: another library's are kept, said so, and never made over or recorded as this version's; this version's, or what isn't told, are made and recorded as ever. A recreate (`recreateAll`, a version change, `recreateOnStartup`) of such an item drops by name the objects whose text was read as the other's form (a range index's `lx`, never its `ix`; a constraint's `uq`; a vector's or a full-text index's table beside the nodes, with its trigger and index), says so as a mismatch's drop is said, at `INFO`, and makes it in this version's form with a record of form 1 (a uniqueness constraint in its place: see [the schema plan](#the-schema-plan)). A remove drops by the record, and so leaves such objects as they are. A known limit: a record's form is taken at its word. A record that says the current form over an index of TypeScript's or Python's expressions, as one whose record was lost and written again would be, reads as current.

The listing gives what the store has under the names after the records, a row a type of object under a name, each a map with `object`, its name. On Postgres, `pg_class`: `type`, its `relkind`, which a mismatch names as a word (`r` a table, `p` a partitioned table, `f` a foreign table, `t` a TOAST table, `v` a view, `m` a materialized view, `S` a sequence, `c` a composite type; `i` and `I` an index); and of an index, from `pg_index` and `pg_am`, its `table`, `unique`, its `method`, its `opclasses`, each of its `columns` as `pg_get_indexdef` writes it, and its predicate, `where`, as `pg_get_expr` writes it. On Oracle, `user_objects`: `type`, its `object_type`; of an index, from `user_indexes`, its `table`, `uniqueness` and `indexType`, and its `columns` from `user_ind_columns`, each an expression's text as the hidden column Oracle makes for it holds it (`user_tab_cols.data_default_vc`, null where it keeps none), or a plain column's name; of a table its `tableColumns`, each its name and type; and of a trigger its `table` and its `source`, line by line, from `user_source`. On SQLite, `sqlite_master`: `type`, its `table`, `sql`, the statement that made it, and `unique` from `pragma_index_list`. Each is read by its name in any case, as each store folds an unquoted name to one.

An item of another form is kept and used as it is: a schema manager says so once, at `WARN`, naming the item, the form it expected and the one it found, and that `SchemaManager.recreateAll(<owner>)` makes it again. It is never a problem, so it fails no owner under `FAIL_FAST`; it is never reported `Created`; and it is never written to the marker as stale, since the next run reads it again from the store (drivine-cypher-spec#135). A mismatch is drift, as an item of another shape is on any store (see [the schema plan](#the-schema-plan)).

**Errors.** On Neo4j, a violation is a driver's error of the chain with the code `Neo.ClientError.Schema.ConstraintValidationFailed` or the status `22N79` or `22N80`; or a chain of driver's errors whose every status is `50N11` or `50N42`, one of them with the code `Neo.DatabaseError.Schema.ConstraintCreationFailed`. An index in the way is the code `Neo.ClientError.Schema.IndexAlreadyExists`, and a wait run out `Neo.ClientError.Procedure.ProcedureTimedOut`. On Memgraph and FalkorDB, a violation is a chain whose messages, joined by ` | `, hold `constraint` and `violat`, in any case. On Postgres, it is a SQL error of the SQL state `23505`; on Oracle, of the vendor code `1` or `1452`; on SQLite, a SQL error whose own message holds `UNIQUE constraint failed`. No store but Neo4j has an index in the way or a wait. On Oracle, an index over the same expressions there already is the vendor code `1408`; no other store refuses a second index so. A violation is a suspicion only: a schema manager reports one where the sample finds a key that repeats, and fails with the error where it finds none.

**Declarations.** An owner's declarations of one kind, label and set of properties, as each is made (one that ignores case over the lowercased copies), are one item, kept in the order first declared. They must agree, as declared and not as made, on all but a vector index's options for a store, and a constraint's `nodeIdProperty`: the one declaration that pins a store's options wins, and two that pin different ones are a conflict; otherwise the first constraint with a `nodeIdProperty` wins, and otherwise the first. The item kept is a declaration as declared. The conflict's message names the kind, label and properties (as made, the copies where it ignores case), the reason, and each distinct declaration it is over, once, as drivine4j writes it: where they disagree on the rest, without a vector index's options for a store or a constraint's `nodeIdProperty`. The owner's version token is `marker.yaml`'s `versions`.

## The schema marker and the stamps

Each library keeps three things of its own in a store, and reads what another library kept: the schema marker, a node `(:_DrivineSchema {scope, version, items, appliedAt})` for each owner of a schema catalog, holding the version token it last applied and the inventory of the items it applied; the store's stamp, one node `(:DrivineStore {key: "singleton", storeId, assignedAt, engine})`; and the stamp on each node a save writes. `marker.yaml` pins them: drivine4j's, the reference, as it gave them when they were captured, for the graph `drivine`. The compiler's module (`org.drivine.cypher.store.marker`, and `org.drivine.cypher.store.Stamps`) writes them, and its tests check it gives these, byte for byte, on every target. Running the statements and reading their rows stay each library's.

They are a file of their own, not a part of `store.yaml`, because they are a contract of their own: `store.yaml` is the DDL a store is made with, and this is what the libraries keep in it once it is made, which changes apart from the DDL and is read on every enforce. The constraint each node is kept single by is made as `store.yaml` makes any, so its statements are pinned here too, as the module's DDL gives them.

```yaml
graph: "drivine"
marker:
  label: "_DrivineSchema"
  scopeProperty: "scope"
  defaultScope: "schema"
  separator: "\n"
  runtimePrefix: "runtime:"
  staleRuntimePrefix: "runtime-stale:"
  constraint: {kind: "UNIQUENESS_CONSTRAINT", label: "_DrivineSchema", properties: ["scope"]}
  scopesCypher: "MATCH (m:`_DrivineSchema`) RETURN DISTINCT m.scope"
  stores:
    postgres: {prepare: "ensuring", read: {version: "...", items: "..."}, readParameters: ["scope"], merge: "...", mergeParameters: ["scope", "version", "items", "now"], deleteAllButNewest: "...", delete: "...", scopes: null, itemsMark: "", constraint: [...]}
keys:
  - {spec: {kind: "RANGE_INDEX", label: "Person", properties: ["name"]}, key: "RANGE_INDEX:Person:name:Person_name_range"}
inventory:
  - name: "Stale items"
    record: {keys: [...], runtime: [...], stale: [...]}
    items: "RANGE_INDEX:Person:name:Person_name_range\nruntime-stale:UNIQUENESS_CONSTRAINT:Person:id:Person_id_unique"
    read: {keys: [...], runtime: [...], stale: [...]}
scopeFor:
  - {owner: null, scope: "schema"}
reads:
  - {stored: "items:", read: {keys: ["items:"], runtime: [], stale: []}, oracle: {keys: [], runtime: [], stale: []}}
versions:
  - {versions: ["v2", null, "v1"], token: "v1|v2"}
storeStamp: {label: "DrivineStore", keyProperty: "key", key: "singleton", constraint: {...}, parameters: [...], stores: {...}}
nodeStamps: {property: "__drivine.stamp", token: 16, separator: ":", neverStamped: "-", tokens: [...], stamps: [...]}
```

| Key | What it is |
|---|---|
| `marker` | The marker's label, the property that keys it to its owner, the scope of the owner with no name, and the constraint that keeps one marker for each scope. Each store's statements: `read` gives the `version` or `items` of the scope's newest marker; `merge` writes it, and makes it where there is none; `deleteAllButNewest` removes every other marker of the scope, and `constraint` makes the constraint that keeps one (when a library runs them is its schema manager's, today as drivine4j's `SchemaManager` decides, and #135's once the manager is in the module); `delete` removes it; and `scopes` reads the scope of every marker in SQL, on SQLite, where `scopesCypher` is read on the others. `prepare` names the statement of `store.yaml`'s `tables` a library runs first: Postgres's and Oracle's `ensuring`, SQLite's first `ddl`, and none on a graph engine. Every statement binds the scope as `$scope`; `mergeParameters` are what `merge` binds. `itemsMark` is what the inventory is kept behind on the store. `constraint` is what makes the marker's constraint, without the statements that make the store first, as `store.yaml` writes a case's `create`. |
| `keys` | Each spec's inventory key: `<kind>:<label>:<properties joined by ",">:<name>`, the name the spec's own, or the one derived from its label and properties where it has none or an empty one. A spec that ignores case is keyed as it is made, over the lowercased copies. |
| `scopeFor` | An owner's name, null for the owner with none, and the scope its marker is kept under. |
| `inventory` | A `record` of keys, the runtime ones and the stale ones; its `items`, as every store but Oracle keeps them; and what is `read` back from them. |
| `reads` | A stored text as a store gives it back, or null where no marker or no `items` came back, and what is `read` from it: null for no inventory known, which is not an empty one. `oracle` is what Oracle reads, where it differs, its mark taken off first. |
| `versions` | The version tokens of an owner's catalogs, null for one that sets none, and the token the owner records: null where none sets one. |
| `storeStamp` | The stamp's label, the property it is merged on and that property's value, its constraint, and what `assignIfAbsent` binds: `storeId`, a new UUID's text, `assignedAt`, the moment as ISO-8601 text in UTC, as Java's `Instant.toString` writes it (`2026-11-10T05:00:00.123456Z`: the fraction of a second in three, six or nine digits, the fewest that hold it, and none for a whole second), and not a number, as `readStamps` orders by it, and `engine`, the store's name as the stamp records it. Each store's `engine`, as the stamp records it, its `prepare`, run first as the marker's is, and statements: `assignIfAbsent` makes the stamp where there is none, and `readStamps` reads every stamp as a map `{id, assignedAt}`, the oldest first, tie-broken by id, and a library takes the first, so every reader takes the same one. |
| `nodeStamps` | The node stamp's property and form, two tokens of `token` hexadecimal digits joined by `separator`. `tokens` are the text of a token of 64 `bits`, as Java's `String.format("%016x")` writes it. Each of `stamps` is a stored stamp, its `nodeToken` (what comes before its first colon, or all of it), its `linksToken` (what comes after, or null for nothing), whether it is `twoTokens` (33 long, with its colon at 16), whether it `hasNodeToken` (longer than 16, with its colon at 16), and the stamp it is `withoutLinks`. `neverStamped` is what a save reports as the stamp of a node it found with none. |

**The inventory.** The `items` are the inventory keys, in the order they were recorded, joined by a newline. A key to be recreated when next ensured is written behind `runtime-stale:`, whether or not it is marked runtime too; any other key ensured at runtime behind `runtime:`; and any other as it is. A stale key is read back as a runtime one too, and a key marked runtime or stale that isn't among the keys is not written. An empty inventory is an empty text, so an inventory of one empty key is read back as an empty one. A key holding a newline, which a label can hold, is read back as two keys: the separator is not escaped, as drivine4j writes it. Oracle keeps an empty text as null, so it keeps the items behind `items:`, and takes that off as it reads them; a text with no mark is read as it is.

**The version token** is each catalog's token once, sorted by its UTF-16 code units, as Java sorts strings, and joined by `|`.

**The moment.** On Postgres, Oracle and SQLite, `merge` binds `appliedAt` as `$now`, milliseconds since the epoch by the caller's clock. The graph engines write their own clock's, with `timestamp()`, as drivine4j always has, and bind none. That split is kept on purpose: one clock for every store would be a change of its own, made in every library at once. On a SQL store the newest marker of a scope is the one with the largest `appliedAt`, a marker with none or with one that isn't a number coming last (Oracle reads a text of a number as the number), and of two with the same, the one made last (`nid`). A graph engine orders by `appliedAt` as it orders any value, which every marker it writes has.

## The schema plan

A schema manager decides, from what a store says, what to make, drop, recreate and record, and what to report: drivine4j's `SchemaManager`, `IndexManager` and `ConstraintManager`. The compiler's module (`org.drivine.cypher.store.plan`) decides it once for every library, as a planner with no store: `SchemaPlanner(store, markers)`, whose `start(request, now)` and `resume(state, outcomes, now)` each give a round of actions for the library to run, or the plan done and its report. `plans.yaml` pins its decisions: drivine4j's, the reference, captured from its managers over a scripted store, with no store, for the design's cases 1 to 29 (drivine-cypher-spec#135), and the module's own for case 30, the form check, and case 31, the safe recreate of a uniqueness constraint (whose Oracle, Postgres and SQLite listings and errors are captured from each store), and for the public `IndexManager` and `ConstraintManager` calls (`item`). The module's tests check the planner gives them, round by round, on every target.

It is a file of its own because it is a contract of its own: decisions, not text. Every statement it names is pinned once, by `store.yaml` or `marker.yaml`, and what it pins is when each runs, what it is answered, and what comes of it.

```yaml
graph: "drivine"
database: "default"
cases:
  - case: "2"
    name: "An unchanged version"
    description: "Everything there already: nothing is made, and the marker is written again as it was."
    stores: ["postgres", "oracle", "sqlite", "neo4j", "memgraph"]
    catalogs:
      - {owner: null, version: "v1", items: ["Range index", "Uniqueness constraint"]}
    steps:
      - operation: {enforce: "all"}
        runs:
          - stores: ["postgres", "sqlite"]
            rounds:
              - now: 1000000
                actions:
                  - {execute: {marker: "prepare"}}
                  - {query: {marker: "read.version", scope: "schema"}, rows: ["v1"]}
                  - {query: {marker: "read.items", scope: "schema"}, rows: ["RANGE_INDEX:Person:name:Person_name_range\n..."]}
                  - {query: {listing: "indexes.RANGE_INDEX"}, items: [{kind: "RANGE_INDEX", label: "Person", properties: ["name"], name: "Person_name_range"}]}
                  - {query: {listing: "constraints"}, items: [...]}
              - now: 1000000
                actions:
                  - {execute: {marker: "deleteAllButNewest", scope: "schema"}}
                  - {writeMarker: {scope: "schema", version: "v1", items: "RANGE_INDEX:Person:name:Person_name_range\n..."}}
            done: 1000000
            report:
              owners:
                - {owner: null, results: [{spec: "Range index", alreadyMatching: {...}}, ...], marker: {version: "v1", items: "..."}}
              log:
                - ["INFO", "SchemaManager", "Applying schema for owner 'schema' on 'default': 2 items (forceRecreate=false, versionChanged=false, version=v1)"]
                - ["INFO", "SchemaManager", "Schema for owner 'schema' on 'default': 0 created, 2 already matching, 0 recreated, 0 needing attention"]
```

| Key | What it is |
|---|---|
| `stores` | The stores the case runs on. |
| `catalogs` | The startup catalogs, each its `owner` (null for the unnamed one, whose marker's scope is `schema`), its `version`, and its `items`. |
| `policy`, `buildTimeoutMillis` | The policy, where it isn't the default (`FAIL_FAST`, nothing recreated, a sample of 10, no index replaced), and the wait for an index built in the background, where it isn't 60 seconds. |
| `steps` | The operations run in turn, on one store and one manager: each its `operation` (`enforce` or `recreateAll`, of `all` or `{owner}`; `ensure` or `remove`, of an `owner`'s `items`; `item`, a `call`, `ENSURE`, `RECREATE` or `DROP`, of one `spec`, with no marker), the `runtime` items the manager holds then, by owner, and its `runs`; for an ensure or a remove, `runtimeAfter`, the runtime items drivine4j's manager holds after it; or, for an ensure refused before anything is applied, `refused`, the message. |
| `runs` | The stores that run the step alike, each round's actions with the `now` it is planned at, the `done` moment the plan ends at, and the `report`. |
| `report` | Each owner applied, in order: what each of its items gave, its `unbuilt` indexes, its `orphans`, the `marker` it wrote (null for none), its `failure`, and for a remove what it `removed`; for an `item`, its `result`, or whether it `dropped` one; the database's `failure`, or the store's error it `rethrown`, from the action of that round; and every `log` line at INFO and above, its level, logger and text. |

A spec is a `store.yaml` case's, by its name, or written as its cases write one. An item, what a store has, is written as `store.yaml`'s listings write one. In a log line, `{engine}` is the store's name.

**Actions.** Each round's actions are what the planner gives, in order, and each is answered as the store answers it:

- `{execute: {create: <case>}}`, `{drop: <case>}` and `{dropUnnamed: <case>}` are a `store.yaml` case's statements on the store, a create after the statements that make the store, as its cases leave them out (Postgres's and Oracle's `ensuring`, SQLite's `ddl`); `{marker: "constraint"}` is `marker.yaml`'s constraint, after them too; `{marker: "prepare"}` and `{marker: "deleteAllButNewest", scope}` are the marker's. One no case pins (a FalkorDB constraint's backing index, an index dropped by the name the store gave it) is given whole, `{statement}` or `{native}`, with its `purpose` where it isn't `DDL`; `{formRecorded: true}` is the `catalog`'s `formRecorded`, of purpose `ALIASES`. `{leftover: <case>}`, `{build: <case>}`, `{swap: <case>}` and `{finish: <case>}` are a constraint case's `recreate` steps on the store, and `{remade: <case>}` its `remade`, of purpose `ALIASES`. Each runs as one action a statement, and `failed: {at, causes}` fails the one `at` counts to.
- `{query: {listing: "indexes.<KIND>"}}` and `{listing: "constraints"}` are `store.yaml`'s `catalog` queries, answered as `items`: each store's rows of them, which read back to them (the module's tests write them, and check every store's rows read back so over `store.yaml`'s listings). `{marker: "read.version"|"read.items", scope}` and `{marker: "scopes"}` are the marker's, `{sample: {spec, limit}}` is `store.yaml`'s sample (`refilled: true`, its refill's), and `{indexState: <name>}` Neo4j's; each is answered as `rows`. `delay` is the wait before a poll.
- `{readLowerCopies: {label, properties}}`, a library's read of its record of the lowercased copies, before it fills in those of `properties` on the nodes of `label`, is answered as `rows`, each a record, `[label, property]`.
- `{awaitIndex: {name, timeout}}`, Neo4j's wait, `{fillLowerCopies: {label, properties}}`, the lowercased copies a library fills in and records, and `{writeMarker: {scope, version, items}}`, the marker's merge with what it binds (the items behind the store's mark, and on a SQL store the round's `now`).

An action answered `failed` gives its `causes`, as `store.yaml`'s errors write them; the library stops there, and the actions after it in the round are planned and not run. An action given no answer otherwise ran.

**Rounds.** The library runs a round's actions in order, stopping at the first that fails, and hands back what came of each. The first round reads what the plan decides from: the marker's `prepare`, each owner's marker (its version where it is versioned or ensuring, and its items), and each listing the items are found in, each statement once; for a remove, the scope of every marker. The rounds after it walk the owners sorted by name, the unnamed one first, each apart from the others, and within an owner the indexes before the constraints, each in the order declared, each finished before the next. A listing read is used again until the plan's own DDL runs, one that failed only once, as drivine4j reads it again after, and a marker's until its scope's marker is written or the read fails (an owner named `schema` shares the unnamed one's scope, and reads what it wrote, or reads again what failed for it); everything else drivine4j reads after its DDL (an item found after it is made, a constraint's sample, an index's state, a poll of a store that builds in the background) is read then. A state between rounds is JSON, which a library may hold anywhere.

**Running a round.** In the module's API each action is a `PlanAction`, and its `Purpose` says where the library runs it, as drivine4j does:

- `Query`: the statement with its `parameters`, after waiting `delayMillis` (a poll), compiled first where it is `compiled` (the marker's scopes, Cypher, on Postgres and Oracle). A listing (`LISTING`), an index's state (`STATE`) and a sample (`SAMPLE`) run on a schema connection, a marker's read (`MARKER`, `SCOPES`) on the auto-commit manager. It is answered `Rows`: each row a plain value, as [Listings](#the-stores-schema) says (a single column's value, a map, or a list of columns), a number as a number.
- `Execute`: DDL (`DDL`, `ALIASES`, `PREPARE`) in auto-commit, on a schema connection of its own, a FalkorDB `Native` statement as its driver's command; a marker's statement (`MARKER`) on the auto-commit manager. After DDL or aliases, whether it ran or failed, the library tells its own caches that the store's schema changed, as drivine4j's `SchemaGrammar.changed()` in a `finally`. It is answered `Ran`.
- `ReadLowerCopies`, the library's own read of its record of the lowercased copies, as drivine4j's `LowerCopyCatalog.stored()`, on a schema connection, after what its statements need made where they need it (drivine4j's `prepare`, run once). It is answered `Rows`, each row a record as the list of its label and its property, as drivine4j's `entries` reads the store's rows; the planner reads those of `label` and `properties`, and leaves the ones recorded out of the fill.
- `AwaitIndex` (Neo4j), the statement with its `name` and `timeout`, on a schema connection, the `timeout` bound as an integer, which `db.awaitIndex` takes (on the JavaScript driver an `Integer`: a plain number is sent as a float); `FillLowerCopies`, the library's own lowercased copies of `properties` on the nodes of `label`, filled in and recorded through the auto-commit manager, each of them, recorded or not, after the same `prepare` where it hasn't run (a fill can come with no read before it); and `WriteMarker`, the marker's merge with its `parameters`, on the auto-commit manager. Each is answered `Ran`.

An action that throws is answered `Failed`, its `causes` as [a cause](#the-stores-schema) is written, the outermost first; the library keeps the error, and the round stops there. The library runs a failed action again only as an `Execute`'s `retry` says, and swallows no failure: the planner decides which reads as nothing (a listing, a state, a sample), which runs again (the merge) and which is thrown. An error the library raises itself as it has a connection, before a statement reaches the store, which refuses the graph for every owner alike (drivine4j's `ReusedIdsException`: a SQLite graph whose tables give a deleted row's id again, refused on every connection) is not answered: the library throws it out of the round, as it is, and plans nothing more, as drivine4j's `applyToDatabase` rethrows it past its owners' isolation, where the planner would take it, answered `Failed`, as a store's error, and on a marker's read as the owner's failure, the other owners going on. Every other error of an action, the store's or the library's, is answered `Failed`. `now` is the library's clock, in milliseconds since the epoch, at each call: the planner times its waits from it, and a SQL store's marker records it.

**The report.** The library logs each `log` line at its level, under its logger, in order. Then, where `rethrown` is given, it throws the error it kept for the action that failed and ended round `round` (`rethrown.action`), as it got it: drivine4j doesn't catch it. Otherwise, where `failure` is given, it throws its own error (drivine4j's `DrivineException`) with that message; otherwise the operation succeeded. An `ensure` or a `remove` is checked with `validate` on every database before any is planned (an ensure's and a remove's items merged, the indexes before the constraints, as drivine4j's catalog merges them, two that conflict refused), and a refusal is thrown with nothing run; an `ensure` or a `remove` of no items plans nothing. A call plans its databases one at a time, in order of their names, as drivine4j sorts them, and the first whose report throws ends the call: the databases after it aren't planned.

**The runtime items.** The library holds the items ensured at runtime, each a `RuntimeCatalog` of an owner on the databases its ensure named, starting with none, and the module says how they change: `SchemaPlanner.runtimeAfter(operation, runtime, databases)`, the operation given to `databases` (null for all), as the call names them, before the library resolves them to its registered databases. An ensure's items are merged, the declaration that pins engine options or names a constraint's node id property kept, and each replaces the owner's item of its identity on those databases, in its place; a remove takes the owner's items of its items' identities, from every target where it is given to all databases, and from the same databases' otherwise. For an ensure, the library checks each database the call resolves to with `validate`, in order of their names, over what `runtimeAfter` gives, `SchemaPlanner.runtimeOn(database, runtime)` giving each its `runtime`, and keeps the items only where none is refused (the first refusal is thrown, and it, or a target the library refuses, leaves them as they were), and then plans those databases; for a remove, it checks with `validate`, keeps what `runtimeAfter` gives before it resolves the databases (a target refused then leaves the items taken), and then plans each database over it. A library merges no items itself.

**What drivine4j decides, which the plan keeps.** A version that changed recreates the owner's items, but not one another owner declares; a first version is adopted. An ensure records the version the marker has, and `recreateOnStartup` doesn't apply to it. A runtime item a later manager hasn't been given is kept in the inventory; a recreate marks it stale, and the next ensure of it recreates it. A key recorded and no longer declared is an orphan, reported and left; a marker with no inventory has none. Only a versioned owner keeps its marker single. Under `FAIL_FAST`, a drift, a violation, an index in the way or an index not built fails the owner once every item has been tried, and its marker isn't written; under `WARN`, each is logged and the marker written. A failure drivine4j's manager catches (the marker's, the lowercased copies' fill and record, a TEXT index off Neo4j, a wait that ran out) ends the owner there, its marker unwritten, and the other owners go on; one it doesn't (DDL the store refused for a reason the planner doesn't read, a read of the copies' record) ends the plan, and the library throws the store's error. A remove keeps an item another owner declares or records, its properties in any order.

**Forms.** On a SQL store an item is read with its form ([Forms](#the-stores-schema)), from the listing it was found in, and nothing more is read for it. One of another form is kept, `AlreadyMatching`, with a line at `WARN` under `IndexManager` or `ConstraintManager`: `{engine} <kind> on <label>[<properties>] is of another form than this version makes (form 1 expected, found <found>): it is kept and used as it is.`, then `SchemaManager.recreateAll("<owner>") makes it again.` (`recreateAll(null)` for the unnamed owner), or, for a public call, `Call recreate() to make it again.` One a newer version made (a record of a later form) is kept, `AlreadyMatching`, with a line at `WARN`: `{engine} <kind> on <label>[<properties>] was made by a newer version of Drivine (form <n>; this version makes form 1): this version uses it as it is.`, and no recreate is suggested. One of the current form whose record says none has its form recorded, an `Execute` of purpose `ALIASES`, before it is `AlreadyMatching`. A mismatch is drift, with a line at `WARN` that names what stands under the name and what it is, never `Created` and never made over: under `FAIL_FAST` it fails the owner, under `WARN` it is logged and the marker written, and a recreate (`recreateOnDrift`, a version change, `recreateAll`) drops it by its name, `DROP INDEX IF EXISTS <name>`, logs that it dropped an index Drivine didn't make under its name, at `INFO`, reads the listing again, and makes the item, where it is an index (a uniqueness constraint on a SQL store is made in its place, below); where it isn't, a recreate drops nothing and the item stays drift. On Oracle a recreate of an item no record names, whose objects were read as another library's form, first drops each object whose text decided it (`DROP INDEX IF EXISTS <name>`; for a table beside the nodes `DROP TRIGGER IF EXISTS <table>_t`, then `DROP TABLE IF EXISTS <table> PURGE`), with a line at `INFO`: `Dropped {engine} <index or table> <name>, of <found> under its name for <kind> on <label>[<properties>], which no record named, to make it in this version's form`, and then makes the item (a uniqueness constraint's unique index is dropped by the swap, below, and the line said after it).

**A uniqueness constraint made again.** On a SQL store, every recreate of a uniqueness constraint (`recreate()`, `recreateAll`, `recreateOnDrift`, a version change, `recreateOnStartup`, a stale runtime item, and so a mismatch's drop, a form-stale item's and another library's unrecorded one) makes it in its place, as `store.yaml`'s `recreate` pins it (drivine-cypher-spec#135 §4), so data it refuses never leaves it with no index. First, what stands under its names that isn't an index fails it as drift, as above, with nothing run; another index under one of its names but its unique index's (Oracle's index over the property of every node) is dropped by its name and said so at `INFO`. Where nothing stands under the constraint's index's name and the index a recreate builds first does, unique and of the constraint's shape, a recreate was cut off after its old index was dropped: A recreate finishes it: `finish` puts it in its place, said at `INFO` (`Put {engine} index <name>_r in the place of <name> for <kind> on <label>[<properties>], finishing a recreate that was cut off`), it is never dropped first, and the constraint's `create` and `remade` follow, the listing read again, `Created`, and `Recreated`. An ensure (and an enforce's) that finds it so keeps it, `AlreadyMatching`, as it holds the data unique, runs nothing (but, where it ignores case, the fill of its copies an ensure runs where no record is listed), fails no owner, and says so once at `WARN`: `{engine} <kind> on <label>[<properties>] is held by <name>_r, the index a recreate of it builds first, and nothing stands under <name>: that recreate was cut off, or is still running. It is kept and used as it is. SchemaManager.recreateAll(<owner>) finishes it.` (`Call recreate() to finish it.` for a public call). It doesn't finish it, as the recreate may be running still in another session, between its drop and its rename: a finish then would rename the index that session is about to, whose rename would then find none, and leave the constraint with no index. A remove (and the public `drop()`) that finds it so drops it, `leftover`, and forgets the record, `drop`, with `Dropped {engine} <kind> on <label>[<properties>], held by <name>_r, the index a recreate of it that was cut off built first` at `INFO` (`plans.yaml` case 31t): left standing, it would go on refusing a key the data repeats for a constraint no one declares. Two recreates running at once are still a race of that kind, which the plan doesn't guard against: a library runs one recreate of an owner at a time, and two processes recreating at once may leave a constraint with no index, or a leftover, that the next recreate makes good. Otherwise: `leftover` (what a recreate left under the name it builds under where the constraint's own index still stands, or of another shape: SQLite's swap cut off before its last drop, or Postgres's swap refused, leaves one beside the constraint's index, which the next recreate's `leftover` drops; a remove, and the public `drop()`, run `leftover` before the drop by the record, so one isn't left refusing keys for a constraint no one declares, case 31w); the lowercased copies filled in again, where it ignores case; `build`. A refill the old index refuses is a key the data repeats: it is sampled with the keys lowercased as the fill lowercases them (`schema.samples`' `refilled`), as the copies hold none that repeats, reported `Violation`, and thrown where the sample finds none, nothing built, the old index and its record as they were. Data that refuses the build is sampled, and reported `Violation`, as a create's is, and thrown where the sample finds no key that repeats: the old index and its record are kept as they were. Otherwise `swap`, with the line of what it dropped where that was a mismatch or another library's (at `INFO`); where the record found lists the constraint's properties in another order than it is declared in (found all the same, as identity is a set; an index under its own name still standing, the one built first beside it is a leftover, not a recreate cut off after its drop, case 31v), its own index, under the name that order gives, is dropped and the record forgotten by it (the constraint case's `drop`), said at `INFO`, and its aliases set on the record made (`aliased`), so one index and one record are left; Oracle's `ORA-01408` drops by that record too; then the constraint's `create`, which finds its index made, `remade`, the listing read again, and `Created {engine} <kind> on <label>[<properties>]` at `INFO`, `Recreated` from the record as first found. Oracle builds no second index over the expressions of one there (`ORA-01408`; a plain index over them it builds beside, which the data alone refuses): the build so refused, the index under the constraint's name is dropped first (`DROP INDEX IF EXISTS <name>`) and the `create` and `remade` run as above, a violation of the `create` sampled as one of the build's. Its line, `Dropped {engine} index <name> of <kind> on <label>[<properties>] before making it again: Oracle builds no second index over the same expressions (ORA-01408), so the new one can't be built beside it.`, goes on at `INFO`, `It was made as this version makes it, so the data it held unique is unique still, but for a write in between`, where the index was of the current form; and at `WARN`, `It was <its form>, not made as this version makes it: where the data repeats a key, <label>[<properties>] is left with no index until the constraint is made`, where it was of another form, a newer one, or no index Drivine made. A step after the build that fails (the swap, the rename, the record) is the store's error, thrown as any DDL's: Postgres's swap is one transaction, and leaves the old index and the new one beside it; Oracle's, refused at the drop, leaves both, and refused at the rename, only the new one, under the name it was built under, which the next enforce or recreate finishes; SQLite's leaves the new one, and the old where its drop hadn't run; and a failed `remade` leaves the index in place and its record as it was. Each is pinned with what the store gave (`plans.yaml` case 31e), as are a refill refused for another reason than a key that repeats (31o, the owner failed with the fill's error), a build the data refused whose sample then finds no key that repeats (31p, the refusal thrown), a build refused for another reason (31q, thrown), an `ORA-01408` followed by a `create` a write in between refuses (31r, the violation reported, the constraint left with no unique index), and an `ORA-01408` over a newer version's index (31s, at `WARN`). The graph engines drop and then make, as drivine4j does: Neo4j refuses a second constraint over the same schema, and none of them renames one.

**Where reads differ.** A plan reads less than drivine4j: drivine4j reads a listing again for each item, and runs the marker's `prepare` before each owner's first marker statement, where the plan reads a listing once until its own DDL runs, and prepares once. It also reads a listing in the first round that an item made before its use then makes it read again. What is written, and in which order, is drivine4j's, and so is every log line.

## Host functions and readers

Compiled SQL calls functions each library registers on SQLite (`drivine_equal`, `drivine_add` …, and `regexp`, which SQLite calls for its `REGEXP` operator), and each library reads the rows itself, where a store's JSON holds no NaN or infinity: SQLite writes NaN as the tag `{"$numberDouble":"NaN"}` and an infinity as `9e999`, and Postgres, in the rows of a statement given NaN or an infinity, writes stand-in numbers past any double's. That code is each library's, not the compiler's, so `host.yaml` pins it, run by each library's unit suite with no container: on an in-memory SQLite with its functions registered, and on its row reader. The functions are moving into the compiler module, as a SQLite extension each library loads (#108): the module runs the `function` steps of those it implements too, on every target and through SQL on the extension, and lists the rest as not yet ported (see the compiler's README).

```yaml
- name: "drivine_add"
  description: "drivine_add(a, b) is Cypher's a + b of two JSON values, as JSON text: NaN adds as a number …"
  pairs:
    writes.yaml: ["NaN worked out from stored infinities", "NaN and the infinities written"]
  steps:
    - function: "drivine_add"
      args: ['9e999', '-9e999']
      result: '{"$numberDouble":"NaN"}'
```

A case has a `name`, unique in the file, a `description`, `pairs`, and its steps. A step has an optional `note` and is one of these:

| Keys | What it checks |
|---|---|
| `function`, `args`, `result` | The SQLite function, called with `args`, gives `result`. Each argument and the result is a SQL value: a text (the JSON text a function of JSON values takes, a rounding mode, or a regular expression), a whole number, a float, or null. A text result is compared exactly. `regexp` is called as SQLite calls it for `text REGEXP pattern`: `regexp(pattern, text)`, the pattern first. |
| `function`, `ascending` | The function of one argument, called on each of `ascending` in turn, gives values that ascend as SQLite orders them, each before the next. For `drivine_sort_key` of a list, whose text is each library's own: only its order is pinned. |
| `read`, `value` | A column of a compiled statement's rows reads as `value`, as `PersistenceManager.query` gives it. `read` has the `store` (`postgres` or `sqlite`), `nonFinite` (whether the statement was given NaN or an infinity, which the compiled statement says), and the `column`'s raw JSON text: a text, or a list of texts and `$repeat`s written one after the other. |

Values are written as in the other files: `{$float: "NaN"}` is NaN, `{$repeat: …}` a text repeated, and any other map, `{$numberDouble: "2.0"}` among them, is the map it is.

**Pairs.** A host function and the compiled statements that call it are one contract: a change to one alone changes what a statement gives. So each case's `pairs` names, by file, the store cases in `queries.yaml`, `writes.yaml` and `temporal.yaml` that rely on its steps, and a runner checks, before the case passes:

- that each case named is in its file;
- for each function its steps call, that a step of a paired case, run on SQLite, compiles to SQL that calls it: for `regexp`, SQL that holds the operator `REGEXP`;
- for each `store` and `nonFinite` its steps read, that a step of a paired case, run on that store, compiles with that `nonFinite`.

A change to a host vector names the store cases it moves, and a change to a paired store case shows which host vectors it leans on. A host case with no pairs, or whose pairs no longer rely on it, fails.

**Regular expressions.** On SQLite a regular expression the compiler writes, given to `REGEXP`, `drivine_regex_group` or `drivine_regexp_replace`, is read by each library's own language: Java's, JavaScript's or Python's, each rewritten from Java's as its library rewrites it. So the compiler writes them only with what `host.yaml`'s `regexp` case pins every library reads alike: `^` for the text's start and `\z` for its end; each class written out, with `\t`, `\n`, `\f`, `\r`, `\xNN` and `\uNNNN` and ranges of them, and `[0-9]` for a digit; a backslash before a character of the syntax (`^$\.*+?()[]{}|/`) for the character; groups, `(?:…)`, alternatives, and `?`, `*`, `+` and `{m,n}`. It writes none of what the libraries read otherwise: `\s`, `\d`, `\w`, `\b` or any other class escape, which are Unicode's on drivine4j and partly ASCII's on Drivine for TypeScript; `$`, which in Java matches before a line break that ends the text too; `\Z`; `.`, which in Java matches no U+0085; a class within a class, or `&&` in one, which Java reads as their union and intersection; a POSIX class (`[:alnum:]`) or `\p{…}`; or a flag group. A pattern a statement gives `=~` is its own, read as Java reads it: the compiler's group around it, `^(?:…)\z`, is written as above, and a leading `(?i)` in it is pinned. The compiler's tests check every pattern it writes on SQLite over the whole spec.

## Full-text search

A full-text search (a library's `loadMatching`) is given a label, the properties of its full-text index, a query as a user writes it, and `topK`, and gives the best `topK` nodes that match, each with a score. On a graph engine the store's own index answers it: Lucene's on Neo4j, Tantivy's on Memgraph, RediSearch's on FalkorDB. On a SQL store Drivine parses the query and scores the nodes itself, by BM25, or through Oracle Text where Oracle has the index. `search.yaml` pins what a search finds, the same on every store, and how close each other store's ranking must come to Neo4j's. Neo4j's is the one the others are held to.

```yaml
graph: |
  CREATE (:Doc {id: 'graphs', body: 'graph databases store graph data'}), ...
indexes:
  - {kind: "FULLTEXT_INDEX", label: "Doc", properties: ["body"]}
cases:
  - name: "Words are ORed"
    description: "A node that holds any of a query's words is a hit."
    steps:
      - search: {label: "Doc", properties: ["body"], query: "soup kiwi", topK: 50}
        ids: ["kiwi", "soup"]
        today: [{stores: ["falkordb"], ids: [], issue: "liberation-data/drivine4j#666"}]
ranking:
  corpus: "search/docs-corpus.json"
  write: "UNWIND $rows AS r CREATE (:Article {id: r.id, title: r.title, body: r.body})"
  index: {kind: "FULLTEXT_INDEX", label: "Article", properties: ["body"]}
  search: {label: "Article", properties: ["body"]}
  top: 5
  recorded: {image: "neo4j:2026.10.1", digest: "neo4j@sha256:…", statements: [...]}
  bars:
    - {stores: ["postgres", "oracle", "sqlite"], sameTop: 17, overlap: 4.3, target: {sameTop: 21, overlap: 4.5}, measured: {...}}
    - {stores: ["neo4j"], sameTop: 21, overlap: 4.95, note: "...", measured: {...}}
    - {stores: ["memgraph"], sameTop: 16, overlap: 4.09, note: "...", measured: {...}}
    - {stores: ["oracle-text"], sameTop: 5, overlap: 2.57, note: "...", measured: {...}}
    - {stores: ["falkordb"], sameTop: 9, overlap: 2.04, note: "...", measured: {...}}
  queries:
    - {query: "GraphObjectManager", neo4j: ["legacy-graph-object-manager#1", ...]}
```

**The stores.** A search runs on `neo4j`, `memgraph`, `falkordb`, `postgres`, `oracle`, `oracle-text` and `sqlite`. Oracle is two stores here: `oracle` has no full-text index made, and Drivine scores by BM25; `oracle-text` has the index made, which is Oracle Text, and Oracle Text scores. The group `graph` is the three graph engines (Neptune has no full-text search, and runs none of the file), and `sql` is `postgres`, `oracle`, `oracle-text` and `sqlite`. A step's `only` and `except` name them as the other files' steps do.

**The exact cases.** For each store, a runner empties the graph, makes each of `indexes` (as the schema API ensures a spec, `store.yaml`'s DDL; on `oracle`, none), writes `graph`, and waits for the indexes to hold it (`CALL db.awaitIndexes()` on Neo4j; Oracle Text's index holds what is committed, so the write is committed first). On Postgres it runs every case twice, with the indexes made and without them: the index only narrows the nodes read, and both give the same hits. Each step is then one search, with no threshold, and its hits named by their `id` property:

| Key | What it is |
|---|---|
| `search` | The search: its `label`, the `properties` of its index, its `query`, and `topK`. |
| `ids` | The hits, in any order. |
| `ranked` | The hits, best first. |
| `error` | The message the search is refused with. |
| `only`, `except` | The stores the step runs on, or doesn't. |
| `today` | Not read. What a store gives today where it differs, and the issue that makes it pass: `stores` (stores or groups), and `ids`, `ranked` or `error`, or none of them where it gives anything but the step's. A library holds such a step in its own HELD list, so the step says what every store is to give. `unfiled` marks a difference with no issue yet. |
| `note` | Why the step is there. It is not read. |

No step rests on how a store breaks a tie. On Neo4j no two hits that a `ranked` step orders, or that `topK` keeps or leaves out, score alike; where another store scores them alike, the step leaves that store out (`except`), and where the tie is only of order and not of which hits `topK` keeps, a step of `ids` pins its hits there.

A case says what Neo4j's index gives, with Neo4j's default analyzer, `standard-no-stop-words`: words ORed, a phrase, `+` and `-`, `AND`, `OR` and `NOT` (and `&&`, `||`), `word*`, `field:word`, escapes, case and Unicode. A refusal is Drivine's own, not Neo4j's: a query with no word to look for (operators, punctuation or excluded words alone) and an empty one are refused with `A full-text query needs a word to look for: '<query>' has none.`, on every store, where Neo4j gives no hits, every node, or a parse error.

**The ranking.** Scores differ between stores in scale, so the ranking pins ids and order, not scores. A runner writes the corpus (`search/docs-corpus.json`, a section of Drivine's docs to a node, `{id, title, body}`) with `write`, bound as `$rows`, makes `index` and waits for it as the exact cases do (on `oracle`, none; on Postgres, with it and without it), and asks each of `queries` for its best `top`, by `search`. Over the queries whose `neo4j` is not empty, it counts those whose top hit is Neo4j's, and the mean of how many of the top five are in Neo4j's top five, as sets. Neo4j is asked too, and has a bar of its own at full agreement with the lists, so a Neo4j image that has drifted from the recording fails loudly: the other stores are measured against the lists, not against Neo4j, and wouldn't show it. On each store of a bar, the count must be at least `sameTop` and the mean at least `overlap`. `target` is where the BM25 stores' bar goes once BM25 measures a text's length in words (liberation-data/drivine4j#665), and the other bars have none yet; `measured` is what each store gave when the file was recorded, and is not read, and so is a bar's `note`. Each store's bar is what it gave when the file was recorded, rounded down, so a change can't make any store rank further from Neo4j, and no higher than the store gives however it breaks a tie between hits that score alike, at the top or at the fifth, so a runner needn't break ties of its own (Oracle Text's and FalkorDB's bars are lowered so, and Memgraph's is the worst of its recorded runs, as their notes say; on Neo4j no two of a query's first six hits scored alike); Oracle Text's is its own, as it isn't BM25, and Memgraph's and FalkorDB's are their search engines'.

**The corpus** was drivine4j's `src/test/resources/fulltext/docs-corpus.json` at dd4a66f0, byte for byte (SHA-256 `865f814ceaba8ade6ba604dcb3614aa344529c0f701991c40b6c169ee4c9c0e5`); drivine4j's `FullTextRankingAgreementTest` now reads this copy: the sections of Drivine's own docs at 3a8b0b12, as that test says, each a node. Its `queries` are that test's.

**Recording Neo4j's ranking again.** `recorded` names the image the `neo4j` lists were recorded on, by digest, the `version` it reported and the `date`, and the statements that record them: the index made and filled, and each query asked of it. When Neo4j's pin moves, run them on the new image, through the test lock, and write the lists again with the new image's name and digest; a change of a list is Neo4j's and is said so in the pull request. drivine4j's `Neo4jRanking` asks Neo4j the same way.

## Changing the spec

These files are a contract between the three libraries. They live in [drivine-cypher-spec](https://github.com/liberation-data/drivine-cypher-spec), and each library copies a tagged version into its tests, unchanged, with a script of its own (`scripts/sync-cypher-spec.sh` in drivine4j). A change of what the compiler gives or refuses lands there first, in a tagged release, and each library then moves to that tag.

Some tests stay in each library's own suite: values that change on every run (a UUID, the time), parameters of a language's own temporal types, statements built in code (hundreds of `CREATE`s), and whatever needs a connection of its own (a rolled-back transaction).
