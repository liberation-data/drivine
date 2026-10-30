## Supported Engines

The same models, queries and DSL run on each graph store. Switch the engine with `DATABASE_TYPE`.

| Engine | Type | Object manager | Transactions | Search |
|---|---|---|---|---|
| Neo4j 5 | `NEO4J` | yes | full | vector, full-text |
| Memgraph | `MEMGRAPH` | yes | full | vector, text |
| FalkorDB | `FALKORDB` | yes | each statement commits by itself | vector, full-text |
| Oracle 23.9 or later | `ORACLE` | yes | full | vector, Oracle Text |
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

Oracle Database 23.9 or later, through `oracledb` in thin mode. Oracle doesn't speak Cypher: Drivine reads the graph
with SQL/PGQ (`GRAPH_TABLE`) and writes it as rows. Models, the DSL and the object manager are the same as on the graph
engines.

Drivine needs 23.9 because Cypher's `randomUUID()` is Oracle's `UUID()`, a random version 4 UUID, which Oracle added
in 23.9. A provider reads the version the driver found on its first connection, which needs no grant. On an older
Oracle, plain SQL still runs, and a Cypher statement is refused with the version found.

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
constraints Drivine made, as drivine4j records them. The layout is drivine4j's, so the JVM, Node and Python read one
store, and each sees and drops the indexes the others made, and makes none beside them.

Beside the tables the graph is made with one function, `<graph>_nulls_equal`, by which a compiled Cypher statement
compares two lists or maps that may hold a null (see the notes in
[Cypher on Oracle and Postgres](#cypher-on-oracle-and-postgres)). Making it takes `CREATE PROCEDURE`, which the
`RESOURCE` role grants, as well as the `CREATE TABLE` the tables take. A store an earlier version made gains it the
next time a connection to the graph first connects. Where the user that makes the graph may not make a function, the
graph is made without it, and Drivine logs a warning once for the graph when a statement would call it, and looks for
it again a minute later. Until then a statement that writes, or the step of a `reduce`, compares two lists or maps that
hold a null and differ as JSON as false, where Cypher may give null (`[null] = [1]`), and a read declares the function
itself.

Notes:

- A statement you write yourself is SQL. Parameters are named `$name`, as in Cypher. A statement that writes and returns
  rows is a PL/SQL block that hands them back with `DBMS_SQL.RETURN_RESULT`.
- A Cypher statement, `cypherStatement('MATCH …')`, is compiled to SQL over the graph's tables and gives the rows a graph
  engine gives: see [Cypher on a relational database](04-cypher-on-a-relational-database.md#cypher-on-a-relational-database) to start, and
  [Cypher on Oracle and Postgres](#cypher-on-oracle-and-postgres) for how it differs.
- A predicate you write yourself, for a load or a delete, is SQL over the root's row: its `props`, `labels` and `stamp`.
  A property of the root may be written as Cypher writes it, `n.name = $name` (or ``n.`a name` ``), and is read as that
  property, as text; a property compared with `true` or `false` is compared with the text a JSON boolean is read as. To
  compare one with a number, read it as a number in SQL.
- A save is one block and checks the stamp, as on the graph engines. A save turned away by a deadlock (`ORA-00060`) or
  a serialization failure (`ORA-08177`) is run again. Another writer that changes a node in SQL should give it a new
  stamp: the first sixteen characters of `stamp` for its properties or labels, the last sixteen for its relationships.
- Index the id of each class you save: `uniquenessConstraint('Person', 'id')` makes the unique index a node is found
  by. Without one, a save reads the table.
- A range index is two indexes, as drivine4j makes it: one over the property whatever the label, and one over the
  label's nodes alone, which a filter is read through. A uniqueness constraint comes with a range index over its
  properties, which stays when the constraint is dropped.
- Oracle reads an empty string as null, so a comparison with `''` in the DSL is written to find a property stored empty.
- `matches` takes a regular expression in Oracle's POSIX dialect, matched against the whole value. A leading `(?i)`
  ignores case; what Java adds, such as `(?:…)`, a look-around or `\b`, is not read. A backreference names the group the
  expression numbers it by, `\1` to `\8`; `\9` is refused, as the group that anchors the expression would make it the
  tenth, which POSIX does not have.
- A vector index is a table of embeddings beside the nodes, kept in step by a trigger, with an Oracle vector index over
  it by neighbour partitions. The table holds the embeddings of the index's size; a node written with another size is
  left out, not refused. `loadNearest` is approximate through it. With no index made, or one of another size than the
  vector's, it measures every node of the label whose embedding is of the vector's size, and is exact.
- A full-text index is a table of the indexed text beside the nodes, with an Oracle Text index over it. `loadMatching`
  reads words, a `"phrase"`, `+must`, `-not` and a `prefix*`. The index holds what has been committed, so a search
  doesn't see its own transaction's writes. Oracle Text is in the regular Free image, not the slim one; without it, or
  with no index made, a search counts the words in the text of every node of the label.
- Each session Drivine opens makes no adaptive plan (`OPTIMIZER_ADAPTIVE_PLANS = FALSE`). On tables without
  statistics, Oracle's adaptive join plan gave no rows for a read of a graph just written, where the same plan, fixed,
  gave them all ([#331](https://github.com/liberation-data/drivine/issues/331)). A statement of yours that relies on
  an adaptive plan can ask for one with the hint `/*+ OPT_PARAM('optimizer_adaptive_plans' 'true') */`.
- Each connection keeps the statements it runs prepared, 30 of them (`oracledb`'s `stmtCacheSize`), so a save, the same
  block each time, is neither sent nor parsed again. A Cypher statement compiled to SQL is not kept: Oracle holds a kept
  statement's memory for as long as the driver keeps it, from about 4 MB for a compiled statement to over 20 MB for one
  that reads a long text, and a few dozen of them ran the instance out of memory (ORA-04036,
  [drivine#396](https://github.com/liberation-data/drivine/issues/396)). So it is prepared again each time it runs:
  about 0.3 ms more for a short statement (Oracle reuses its plan; it doesn't parse it again from scratch). The object
  manager's statements are kept, so where the object manager does what you need, it is the faster way to Oracle.

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
characters; Postgres folds it to lower case. The tables are made on the first connection, when they are not there, as on
Oracle, whichever manager is first: a database you connect to through Drivine gets the graph's tables, even if you send
it only plain SQL. A user who may only read connects to a graph that is already there and up to date. Postgres is a
graph store like the others, so a schema catalog that names no database applies to it too, and makes its indexes at
startup: to keep a database you use only for plain SQL free of them, narrow the catalog with `.forDatabase(...)`.

**How a graph is stored.** drivine4j's store, byte for byte, so the JVM, Node and Python read and write one graph:
`<graph>_node (nid, labels, props, stamp)` and `<graph>_edge (eid, src, dst, type, props)`, with `labels` and `props`
as `jsonb` and a GIN index over the labels, so a node carries any number of them; `<graph>_schema`, the indexes and
constraints Drivine made; and `<graph>_write`, the function a save's steps are carried out by, as one statement that is
applied whole or not at all.

Notes:

- A statement you write yourself is SQL. Parameters are named `$name`, as in Cypher, and a statement is bound only the
  ones it names.
- A Cypher statement, `cypherStatement('MATCH …')`, is compiled to SQL over the graph's tables and gives the rows a graph
  engine gives: see [Cypher on a relational database](04-cypher-on-a-relational-database.md#cypher-on-a-relational-database) to start, and
  [Cypher on Oracle and Postgres](#cypher-on-oracle-and-postgres) for how it differs.
- A predicate you write yourself, for a load or a delete, is SQL over the root's row: its `props`, `labels` and `stamp`,
  e.g. `(n.props ->> 'name') = $name`. A property of the root may be written as Cypher writes it, `n.name = $name` (or
  ``n.`a name` ``), and is read as that property, as text; a property compared with `true` or `false` is compared with
  the text a JSON boolean is read as. To compare one with a number, read it as a number in SQL.
- A number is compared as a number only where one is stored: `'7'` is not `7`, as on the graph engines.
- Text is ordered by the database's collation, so a page of mixed-case text may not be in the order Neo4j gives
  (`a, b, B` rather than `B, a, b`). The range indexes are made in that collation, so an order and a seek are read
  through them. Compiled Cypher orders text by its code points instead
  ([Cypher on Oracle and Postgres](#cypher-on-oracle-and-postgres)).
- A save checks the stamp, as on the graph engines. A save turned away by a serialization failure (`40001`) or a
  deadlock (`40P01`) is run again.
- Index the id of each class you save: a range index or a uniqueness constraint is a partial index over the label's
  nodes, which finds a node by its id.
- `matches` takes a Postgres regular expression, matched against the whole value.
- A vector index is a pgvector HNSW index over the embeddings of the label's nodes of its size; `loadNearest` is
  approximate through it, and exact with no index made. A full-text index is a trigram index over the text a search
  reads, which narrows the search; `loadMatching` scores the same with it and without it, and reads words, a
  `"phrase"`, `+must`, `-not` and a `prefix*`.

### Cypher on Oracle and Postgres

A Cypher statement given to a `PersistenceManager` on Oracle or Postgres is compiled to SQL over the graph's tables, so
a statement written for a graph engine runs there and gives the same rows. The compiler is drivine4j's, ported: what a
statement gives on each store, compiled or not, is the shared
[Cypher spec](https://github.com/liberation-data/drivine-cypher-spec), which Drivine's tests run on Neo4j, Postgres
and Oracle. To get started, see [Cypher on a relational database](04-cypher-on-a-relational-database.md#cypher-on-a-relational-database).

```typescript
const names = await pm.query<string>(
    new QuerySpecification(cypherStatement('MATCH (p:Person)-[:KNOWS]->(f) WHERE p.name = $name RETURN f.name')).bind({ name: 'Keanu' })
);
```

- A statement must say it is Cypher: a statement of no language is SQL on these stores.
- The graph's tables are made on the first connection to the store, on Oracle and Postgres alike, so Cypher runs on a
  new store with no object manager.
- A row is one value: the one item a `RETURN` has, or a list of its items when it has more. A node is its properties,
  and so is each node or relationship of a list of them (`collect(n)`, `nodes(p)`); compared, indexed, searched with
  `IN` or iterated, its items are the nodes themselves, so two with equal properties differ.
- A statement that writes (`CREATE`, `MERGE`, `SET`, `REMOVE`, `DELETE`, `FOREACH`) runs as one statement, applied whole
  or not at all: an anonymous PL/SQL block on Oracle, and a function of the session's own (`pg_temp`) on Postgres.
- Variable-length relationships (`-[:R*1..3]->`, `-[:R]->{1,3}`) and quantified path patterns
  (`(a) ((x)-[r:R]->(y) WHERE x.v < y.v){1,3} (b)`) compile. A quantified path pattern's variables are lists of what
  each repetition matched. On Oracle, whose recursive queries read nothing of the row they are in, its `WHERE` and
  properties read no variable from outside it, and hold a subquery only where no variable of its `MATCH` or before it
  is named, and that walks no variable-length relationship or quantified path pattern of its own; on Postgres they may.
- A map or a list that holds a node or a relationship (`{x: r}`, `[r, 1]`) compares by what it holds, not by its
  properties, through a `WITH` or a `CALL { … }` too, as on a graph engine. Unwound by `UNWIND`, as a comprehension's
  or a reduce's variable, or carried past a write in the statement, it compares by its properties.
- Lists and maps that hold a null compare item by item, as in Cypher: `[null] = [null]` is null, `[1, null] = [2, null]`
  false, and `IN` compares a value with each item as `=` does, so `2 IN [1, null]` is null. On Oracle, where one holds
  a null, two written as the same JSON are null at once, and any other two are walked by the graph's function
  `<graph>_nulls_equal`, in a statement that writes and the step of a `reduce` too. Where the store has no such function
  (see [Oracle](#oracle)), a read declares it, and a statement that writes, or the step of a `reduce`, compares two such
  values that differ as JSON as false. Lists and maps written out in the statement, `[null] = [1]`, are compared item by
  item everywhere.
- `<`, `<=`, `>` and `>=` order two lists item by item where the statement makes one of them a list (`n.tags < ['b']`).
  Two values whose kind it leaves open, such as two parameters or two properties, compare as null where they hold
  lists. Two maps compare as null, and two that differ do in a list too, where Neo4j orders them. On Oracle, two lists
  so ordered are walked item by item by a function the query declares, so such a comparison is refused in a statement
  that writes and in the step of a `reduce`.
- `CALL db.labels()` and `CALL db.relationshipTypes()` compile, alone or within a query with `YIELD`, and give each
  label and type something has now, read from the nodes and relationships; any other procedure is refused. A parameter
  may be named by a keyword (`$limit`), as in Neo4j.
- Functions of numbers (`exp`, `log`, `sin`, `atan2`, `round` by a mode …) give the floats Neo4j gives, but where Neo4j
  gives NaN or an infinity (`log(0)`, `sqrt(-1)`, `exp(1000)`) the statement fails: JSON holds neither. A float is
  written as Java writes a double, by `toString` and added to a text: `1.0E7`, `1.2E-4`.
- On Oracle, a property that a `RETURN` or a `WITH` returns or passes on (`RETURN n.name`) is read through its text,
  which costs about 2.4 to 3.8 times a plain read: 100,000 rows of `RETURN n.name` take about 490 ms, against 150 ms.
  This works around an Oracle bug, seen on 23.26.3: a string past about 32 KB taken from JSON as JSON, returned or fed
  on into more SQL, crashes the session (ORA-03113, with ORA-00600 [17114] or ORA-07445 in the alert log) over two or
  more rows. Only an item that is the property itself is read so: one inside an item (`RETURN [n.name]`,
  `collect(n.name)`) is read as JSON, as before, and isn't worked around. It goes once an Oracle release no longer
  crashes on the repro in drivine4j's
  [docs/oracle-long-json-string-crash.md](https://github.com/liberation-data/drivine4j/blob/master/docs/oracle-long-json-string-crash.md).
  Such a text still can't be sorted by, grouped by or made `DISTINCT`: Oracle sorts and groups JSON only up to about
  32 KB, and refuses the statement (ORA-40180), leaving the session open.
- On Oracle, writes are worked around for the same bug: a text that a write takes from an unwound parameter's item, or
  from another value of its rows, to write it (`UNWIND $rows AS r MATCH (n {id: r.id}) SET n.a = r.a`, `CREATE (:X {a:
  r.a})`, `MERGE … SET n.a = r.a`) is read from the row's text, at no cost drivine4j measured: 1,000 rows set by one
  statement take as long as before. Any other value, a map set whole by `SET n += r` among them, is read as before. See
  "In a PL/SQL block, from a `JSON` variable" in drivine4j's
  [docs/oracle-long-json-string-crash.md](https://github.com/liberation-data/drivine4j/blob/master/docs/oracle-long-json-string-crash.md).
- On Oracle, so are reads of an unwound item's value: a text that a `RETURN` or a `WITH` gives from an unwound
  parameter's item, or from another unwound list's (`UNWIND $rows AS r RETURN r.a`, `WITH r.a AS a`, `SET n.a = r.a
  RETURN r.a`), is read from the item's text, at about 1.4 times a plain read: 100,000 rows of `RETURN r.a` take about
  800 ms, against 560 ms. Any other value is read as before, and so is a value of a map made of a node's properties and
  not unwound (`WITH n {.a} AS m RETURN m.a`); after a write, which carries its rows on, such a value is read from the
  item's text too. A pattern that matches on such a text (`MERGE (n:X {a: r.a})`) compares it as JSON, which Oracle
  refuses past about 32 KB (ORA-40180), leaving the session open.
- On Oracle, so are reads of a list's item by its place ([#455](https://github.com/liberation-data/drivine/issues/455)):
  an item read by index, by `head()` or `last()`, or after a slice, of a list `split` makes, a stored list, or one a
  `WITH` passes on (`split(n.bio, 'x')[0]`, `head(n.tags)`), is read from the list's text where it is a text, at about
  1.4 to 2.5 times a plain read, as drivine4j measured, and the list is written out whole for it. Any other item is read
  as before, and so is an unwound item. A list made of a long property (`[n.bio, 'y']`) still takes the property out as
  JSON, as above. See "An item of a list, read by its place" in drivine4j's
  [docs/oracle-long-json-string-crash.md](https://github.com/liberation-data/drivine4j/blob/master/docs/oracle-long-json-string-crash.md).
- On Oracle, a text past 4,000 bytes is measured, cut, changed, searched, reversed and added to whole (`size()`,
  `toUpper()`, `substring()`, `replace()`, `split()`, `reverse()`, `STARTS WITH`, `CONTAINS`, `=~`, `+` …): Oracle reads
  a text out of JSON as a `VARCHAR2` of at most 4,000 bytes, so a longer one is read again as a CLOB, and a short one
  isn't. `CONTAINS` looks for a text past 32,767 UTF-16 units, which `INSTR` refuses (ORA-22828), by comparing it whole
  at each place its first 1,000 units are ([#457](https://github.com/liberation-data/drivine/issues/457)); over an
  aggregate's result (`head(collect(n.t)) CONTAINS $x`) it still fails so, until
  [#414](https://github.com/liberation-data/drivine/issues/414) works the aggregates out first. A property such a
  function reads is read from the properties by its own path, which costs about a quarter more on short texts, and a `+`
  that may put texts together costs about a tenth more, as drivine4j measured.
- On Oracle, an `OPTIONAL CALL` or an `OPTIONAL MATCH` is joined `ON 1 = 1`, where Postgres joins `ON TRUE`. This works
  around an Oracle bug, seen on 23.26.3: in a scalar subquery, as a `COUNT { … }` is compiled, a join `ON TRUE` is
  refused (ORA-00907) or crashes the session (ORA-03113, with ORA-07445 in the alert log)
  ([#377](https://github.com/liberation-data/drivine/issues/377)). It goes once an Oracle release no longer fails the
  repro in drivine4j's
  [docs/oracle-on-true-in-scalar-subquery-crash.md](https://github.com/liberation-data/drivine4j/blob/main/docs/oracle-on-true-in-scalar-subquery-crash.md).
- On Oracle, a compiled query that reads the graph's node or relationship table twice or more, and each query of a
  write that does, carries the hint `NO_JSON_TABLE_TRANSFORM`. This works around an Oracle bug, seen on 23.26.3:
  Oracle's JSON table transformation reads several JSON values of one node's row by one `JSON_TABLE`, and so rewritten
  beside another node's table the query lost that node's label and property tests, giving rows its pattern doesn't
  have and values of the wrong node, or crashing the session (ORA-03113)
  ([#435](https://github.com/liberation-data/drivine/issues/435)). A query of one table carries no hint.
- On Postgres, float arithmetic, `sum()` and `avg()` are worked out in exact decimal (`numeric`), not as doubles, so
  they are more accurate: `0.1 + 0.2` is `0.3`, where Neo4j gives `0.30000000000000004`. A result differs from a
  graph engine's only around its 16th significant digit, and still comes back as a float. It shows only where a result
  is compared for exact equality with one worked out in doubles, which is fragile with floats anyway. A float's text
  carries no trailing zeros: `toString(4.0 / 2)` is `"2.0"`.
- On Postgres, text is compared and sorted by its code points, as Cypher does (`B, a, b`), not by the database's
  collation: in the `C` collation, whose byte order is code point order in a UTF-8 database, as `initdb` and Postgres's
  images make one. In a list the statement makes, such as `ORDER BY [n.last, n.first]`, a text is ordered by its code
  points over its first 500 characters, and past them by the database's collation. A list read from a property, and a
  map, still order the texts in them by the database's collation (`ORDER BY n.tags`).
- Cypher the compiler doesn't take is refused by name before the store is sent anything, e.g. `A path variable in
  CREATE or MERGE is Cypher, and is not compiled to SQL yet.`
- A temporal value is its ISO 8601 text, where a graph engine's driver gives a value of its own. A zoned value the
  statement makes sorts as its moment (`ORDER BY datetime(n.at)`); one read as a property sorts as its text, and so
  does a map that holds one. A list of them, or a list of lists of them, sorts item by item so in an `ORDER BY`, `min`
  and `max`. Oracle reads by their places, not with `JSON_TABLE`, the items of a list that holds temporal values the
  statement makes, at any depth: a list of them, a list of lists or of maps of them (`collect(DISTINCT [l, l])`), one a
  `CASE`, `coalesce` or `reduce` may give, or one taken back out of a map; and the keys of any map, which `keys` reads
  from a list Oracle makes of them. Oracle 23 takes many seconds, or minutes, to parse a `JSON_TABLE` over a list
  worked out item by item with temporal arithmetic (`[i IN range(1, 10) | t + duration({minutes: i})]`), and neither a
  query timeout nor a kill ends the parse ([drivine4j#331](https://github.com/liberation-data/drivine4j/issues/331),
  [drivine4j#347](https://github.com/liberation-data/drivine4j/issues/347)). Other lists keep `JSON_TABLE`, which is
  about ten times as fast for a short list; read by their places, the keys are faster than `JSON_TABLE` gave them.
- A parameter is bound as JSON, so a number that is whole is a whole number, though it was written `2.0`:
  `toString($f)` of it gives `'2'`, where Neo4j, which the driver sends a number to as a float, gives `'2.0'`.
