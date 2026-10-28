**Docs: [drivine.org](https://drivine.org/ts/)**, for TypeScript, Python, and Kotlin & Java.

Drivine is a graph database client for Node.js and TypeScript, with a [NestJS](https://nestjs.com/) module, and no need
for one: see [Without Nest](03-quick-start.md#3-without-nest). It supports **Neo4j**, **Memgraph**, **FalkorDB**, **Oracle** (SQL/PGQ)
and **Postgres** as graph stores, plus Amazon Neptune through the low-level API. It gives you two ways to work with a
graph:

1. **PersistenceManager**: a low-level API where you write the queries yourself. This is the classic Drivine approach.
2. **Object manager** (`StatelessGraphObjectManager`): a high-level API that maps decorated classes, with a typed
   query DSL whose references come from the classes themselves.

A Cypher statement runs on every store, the SQL ones too: on Postgres and Oracle, Drivine compiles it to SQL. See
[Cypher on a relational database](04-cypher-on-a-relational-database.md#cypher-on-a-relational-database).

> **On Python or the JVM?** [drivine-python](https://github.com/liberation-data/drivine-python) (`pip install drivine`)
> is Drivine's Python twin, async first with a sync API. [drivine4j](https://github.com/liberation-data/drivine4j)
> (`org.drivine:drivine4j`) is its Java and Kotlin twin, the graph client for [Embabel](https://hub.embabel.com), with
> Spring Boot support and a code-generated DSL. The three share a storage format: a store written from any of them is
> read, stamped and checked alike by the others.

Its design goals:

* Support multiple graph databases, simultaneously if you wish.
* **Scale to hundreds and thousands of transactions per second, without compromising architectural integrity.**
