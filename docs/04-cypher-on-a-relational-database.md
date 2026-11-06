## Cypher on a relational database

Write a Cypher statement once, and run it on whichever store you connect to. Neo4j, Memgraph, FalkorDB and Neptune run
it as written. On **Postgres**, **Oracle** and **SQLite**, the SQL stores Drivine for TypeScript supports, Drivine
compiles it to SQL over the graph's two tables, one of nodes and one of relationships, and gives back the rows a graph
engine gives.

### Connect

Postgres is the quickest to try: `docker run -d -p 5432:5432 -e POSTGRES_USER=app -e POSTGRES_PASSWORD=secret postgres`,
then:

```bash
DATABASE_TYPE=POSTGRES
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=app
DATABASE_USER=app
DATABASE_PASSWORD=secret
```

For Oracle 23.9 or later, set `DATABASE_TYPE=ORACLE`, `DATABASE_PORT=1521` and `DATABASE_NAME` to the service, such as
`FREEPDB1`. For SQLite, with no server, set `DATABASE_TYPE=SQLITE` and `DATABASE_NAME` to the file's path. On any of
them, `DATABASE_DEFAULT_GRAPH_PATH` names the graph's tables, `drivine` unless given. The
[Postgres](07-supported-engines.md#postgres), [Oracle](07-supported-engines.md#oracle) and
[SQLite](07-supported-engines.md#sqlite) sections have the rest.

### Write and read

Give a persistence manager the statement through `cypherStatement`. A statement that doesn't say it is Cypher is SQL
on these stores, as it always has been.

```typescript
import {
    cypherStatement,
    DatabaseRegistry,
    PersistenceManagerFactory,
    QuerySpecification
} from '@liberation-data/drivine';

DatabaseRegistry.buildOrResolveFromEnv();
const pm = new PersistenceManagerFactory().get();

await pm.execute(
    new QuerySpecification(
        cypherStatement(`
            MERGE (a:Person {name: $from})
            MERGE (b:Person {name: $to})
            MERGE (a)-[:KNOWS {since: $since}]->(b)`)
    ).bind({ from: 'Keanu', to: 'Carrie-Anne', since: 1999 })
);

const friends = await pm.query<{ name: string; since: number }>(
    new QuerySpecification<{ name: string; since: number }>(
        cypherStatement(`
            MATCH (p:Person {name: $name})-[k:KNOWS]->(f:Person)
            RETURN {name: f.name, since: k.since} AS friend
            ORDER BY f.name`)
    ).bind({ name: 'Keanu' })
);
// [{ name: 'Carrie-Anne', since: 1999 }]
```

The graph's tables are made on the first connection to a new store, so there is nothing to set up first.

A statement that writes runs as one statement, applied whole or not at all. Each row is one value, so
[return one map](03-quick-start.md#return-one-map) or a scalar, as on a graph engine.

A statement is compiled as written, and nothing is added to it. So a write of a
[`@CaseInsensitive`](05-object-manager.md#lookups-that-ignore-case) property leaves the lowercased copy the object
manager keeps beside it as it was, on these stores as on the graph engines: set the copy in the same statement, or
refill it afterwards ([how](05-object-manager.md#cypher-of-your-own)).

A node's id, `id(n)` or `elementId(n)`, is the key of its row, and a relationship's is the key of its own. Where the
row must pass a comparison of one by `=` or `IN`, as a `WHERE` or one of its conditions joined by `AND` must be passed,
the store reads the row by that key: `MATCH (n) WHERE id(n) = $id`, `MATCH (n) WHERE id(n) IN $ids` and
`UNWIND $ids AS i MATCH (n) WHERE id(n) = i` read a row for each id, not every node for each. The comparison is still
Cypher's, so `5.0` is the id `5`, and a text, a list or null is no id. Under `NOT`, beside an `OR`, or as a value
(`RETURN id(n) = $id`), it reads every row it compares, as an expression of a property does. Oracle may still read
the nodes of a label the pattern names (`MATCH (n:Person) WHERE id(n) = $id`) by the index over labels, as it does for
a key written in SQL, `nid = 6`; without the label it reads the key.

A `DELETE` deletes the nodes and relationships of all its rows at once, a statement for each table, not one for each
row: the relationships first, then the nodes, a node's relationships going with it where it is `DETACH`. One that ends
the statement and deletes one variable, a node with `DETACH` or a relationship, of a match that binds only nodes and
relationships, reads the ids from the match itself, so `MATCH (n) DETACH DELETE n` is one SQL `DELETE`. In a `FOREACH`
or a `CALL { … }` that writes, each row is still written alone, as in Cypher.

Any other write, a `CREATE`, `MERGE`, `SET` or `REMOVE`, and a `CALL { … }` that writes and returns, is a loop over its
rows, and keeps each row it leaves in a list of the store's own that grows in place: an array of `jsonb` in PL/pgSQL, a
`JSON_ARRAY_T` in PL/SQL, a list in Drivine's function on SQLite. It is read as one JSON list once the loop is done, so
the loop takes time in proportion to its rows. Appended to a JSON list, each row copied the list, and ten times the rows
took about a hundred times as long ([#624](https://github.com/liberation-data/drivine/issues/624)). On Oracle, a query
that reads the row a `FOREACH` or a `CALL { … }` is written for is planned for one row (`CARDINALITY`): planned for the
8,168 rows Oracle guesses a `JSON_TABLE` of a variable holds, it read every node for each row, by a hash join.

### What compiles

What each statement gives on each store, compiled to SQL or not, is the shared
[Cypher spec](https://github.com/liberation-data/drivine-cypher-spec). This repository runs version
[v0.21.0](https://github.com/liberation-data/drivine-cypher-spec/tree/v0.21.0) of it on Neo4j, Postgres, Oracle and SQLite, and
drivine-python and drivine4j run the same spec. Reads and writes compile, with variable-length relationships and
quantified path patterns among them. Cypher the compiler doesn't take is refused by name before the store is sent
anything, e.g. `A path variable in CREATE or MERGE is Cypher, and is not compiled to SQL yet.`

Neo4j's schema DDL (`CREATE INDEX`, `CREATE CONSTRAINT`, `DROP INDEX`, `DROP CONSTRAINT`, `CALL db.awaitIndexes`) is
no query: given to a `PersistenceManager`, it is applied to the store's schema, as
[Neo4j schema DDL on the SQL stores](08-schema-management.md#neo4j-schema-ddl-on-the-sql-stores) describes, and the
compiler alone refuses it.

### How complete is it?

The [openCypher TCK](https://github.com/opencypher/openCypher/tree/main/tck) is openCypher's own test suite: 3,896
scenarios, each a graph, a query, and the rows or the error the query must give.
[drivine4j](https://github.com/liberation-data/drivine4j) runs all of them through its compiler on each store. The
scores below are measured on drivine4j, as its [TCK.md](https://github.com/liberation-data/drivine4j/blob/main/TCK.md)
gives them for `main` on 31 October 2026. Drivine for TypeScript's compiler follows it through the shared spec above;
where drivine4j is ahead, the port is an open issue here.

| store | scenarios passed | of all 3,896 | leaving out the 356 refused on purpose |
|---|---:|---:|---:|
| Postgres | 3,122 | 80.1% | 88.2% |
| Oracle | 3,104 | 79.7% | 87.7% |
| SQLite | 3,088 | 79.3% | 87.2% |
| Neo4j | 3,821 | 98.1% | (none refused) |

The 356 refused on purpose are Cypher the compiler doesn't take yet, refused by name with a clear error before the
store is sent anything.

Most of the rest are not wrong answers. Of the 418 left on Postgres:

- 152 are about errors: 77 statements that run where the TCK expects an error, and 75 that Drivine fails with an error
  of its own where the TCK expects rows.
- 59 are steps the harness can't run through Drivine, such as a test procedure or a CSV file.
- 199 give another result, and 8 make the database fail.

Oracle's and SQLite's are split alike. The comparison is lenient where Drivine's results are shaped differently from
the TCK's: a node is compared by its properties, and any error meets an expected one. Counting an expected error only
where Drivine raised it, before the database, Postgres passes 3,085, Oracle 3,072 and SQLite 3,082.

Neo4j runs the same scenarios through the same harness and misses only the 59 it can't run and 16 where Neo4j itself
differs from the TCK, so the harness is sound and the gap on the SQL stores is the compiler's. Every night drivine4j
holds each store to the scenarios it passed, one by one, so none can slip back unnoticed.
[drivine4j's TCK.md](https://github.com/liberation-data/drivine4j/blob/main/TCK.md) has the method and how to run it.

### Differences you'll meet

The results match a graph engine's, with a few differences. [Cypher on Oracle and Postgres](07-supported-engines.md#cypher-on-oracle-and-postgres)
documents them; the ones you're likeliest to meet:

- A node in a row is its properties.
- A temporal value is its ISO 8601 text.
- Postgres works float arithmetic, `sum()` and `avg()` out in exact decimal, so it is more accurate: `0.1 + 0.2`
  is `0.3` there, where doubles give `0.30000000000000004`. A result differs from Neo4j's only around its 16th
  significant digit, and still comes back as a float.
- Text sorts by its code points, as Cypher does, but on Postgres a list or a map read from a property sorts the texts
  in it by the database's collation ([Cypher on Oracle and Postgres](07-supported-engines.md#cypher-on-oracle-and-postgres)), and Oracle
  reads an empty string as null ([Oracle](07-supported-engines.md#oracle)).

### Or no Cypher at all

You may not need Cypher at all: the [object manager](05-object-manager.md#object-manager) loads and saves your classes on every store
without it.

On Postgres and Oracle it is also the faster way. It runs SQL of its own, written for the store's tables, where a
Cypher statement is compiled to SQL first; and on Oracle its statements stay prepared, where a compiled one is prepared
again each time it runs (see [Oracle](07-supported-engines.md#oracle)).
