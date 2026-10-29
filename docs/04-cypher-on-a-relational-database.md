## Cypher on a relational database

Write a Cypher statement once, and run it on whichever store you connect to. Neo4j, Memgraph, FalkorDB and Neptune run
it as written. On **Postgres** and **Oracle**, the SQL stores Drivine for TypeScript supports, Drivine compiles it to
SQL over the graph's two tables, one of nodes and one of relationships, and gives back the rows a graph engine gives.
SQLite is [drivine4j](https://github.com/liberation-data/drivine4j)'s for now.

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
`FREEPDB1`. On either, `DATABASE_DEFAULT_GRAPH_PATH` names the graph's tables, `drivine` unless given. The
[Postgres](07-supported-engines.md#postgres) and [Oracle](07-supported-engines.md#oracle) sections have the rest.

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

### What compiles

What each statement gives on each store, compiled to SQL or not, is the shared
[Cypher spec](https://github.com/liberation-data/drivine-cypher-spec). This repository runs version
[v0.6.4](https://github.com/liberation-data/drivine-cypher-spec/tree/v0.6.4) of it on Neo4j, Postgres and Oracle, and
drivine-python and drivine4j run the same spec. Reads and writes compile, with variable-length relationships and
quantified path patterns among them. Cypher the compiler doesn't take is refused by name before the store is sent
anything, e.g. `A path variable in CREATE or MERGE is Cypher, and is not compiled to SQL yet.`

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
