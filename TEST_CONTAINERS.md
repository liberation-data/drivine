# Test Containers

## Using Test Containers (Default)

By default, Drivine's tests start a [Testcontainer](https://node.testcontainers.org) for each datasource in
[`.env.test`](.env.test): Neo4j, Memgraph, FalkorDB and Postgres, and Oracle when asked for (see [Oracle](#oracle)).
No setup is needed beyond Docker running on the host. SQLite needs no container: its datasource, `SQLITE_DATABASE_*`, is
a file under `.sqlite`, made where the tests are run from.

```bash
npm test
```

`npm test` starts the containers once, makes the Oracle graph's tables, seeds the default Neo4j with moon town (`test/moon-town.cypher`: the metros,
routes and employee the repository and end-to-end tests read), and runs the suites in three stages, since they share
each store:

1. everything else, in parallel;
2. the schema suites, one at a time: schema changes in parallel wait on each other's locks;
3. the sample app, alone: it clears labels (`Person`, `Organization`, …) other suites write.

Each datasource's host and port, and the user, password and database where the container fixes them, are rewritten to
reach its container. The containers stop at the end; Testcontainers' reaper removes them should the run die.

`npm test -- <path or pattern>` runs Jest on just those tests, in one stage, as `npx jest` does. Jest's global setup then
starts the containers and seeds them itself. Running everything that way, outside the stages, makes suites collide.

## Using a Local Database Instance

To skip a container and use an instance you keep running, set `USE_LOCAL_<TYPE>=true` for its type. That type's
datasources then use their settings in `.env.test` as they are, so put your instance's host, port and credentials
beside the flag in `.env.test.local`, which git ignores and which wins over `.env.test`. The shell wins over both.

| Backend  | Flag                      | Settings it uses as they are                                    |
|----------|---------------------------|-----------------------------------------------------------------|
| Neo4j    | `USE_LOCAL_NEO4J=true`    | `DATABASE_*` and `TRAFFIC_DATABASE_*`                           |
| Memgraph | `USE_LOCAL_MEMGRAPH=true` | `MEMGRAPH_DATABASE_HOST`, `MEMGRAPH_DATABASE_PORT`              |
| FalkorDB | `USE_LOCAL_FALKORDB=true` | `FALKORDB_DATABASE_HOST`, `FALKORDB_DATABASE_PORT`              |
| Postgres | `USE_LOCAL_POSTGRES=true` | `POSTGRES_DATABASE_*`                                           |
| Oracle   | `USE_LOCAL_ORACLE=true`   | `ORACLE_DATABASE_*`                                             |

```bash
# .env.test.local
USE_LOCAL_NEO4J=true
DATABASE_PORT=17687
TRAFFIC_DATABASE_PORT=17687
```

A local Neo4j is seeded with moon town too. Every statement merges, so seeding it again changes nothing.

Each type is chosen alone: a local Neo4j can run beside a FalkorDB container. `<TYPE>_TEST_IMAGE` (`NEO4J_TEST_IMAGE`,
`ORACLE_TEST_IMAGE`, …) picks another image for a type's container.

| Backend  | Image                             | Container's settings                                         |
|----------|-----------------------------------|--------------------------------------------------------------|
| Neo4j    | `neo4j:latest`                    | user `neo4j`, password `drivine-test`                        |
| Memgraph | `memgraph/memgraph:latest`        | no auth                                                      |
| FalkorDB | `falkordb/falkordb:latest`        | the graph is the datasource's `DATABASE_NAME`                |
| Postgres | `pgvector/pgvector:pg16`          | user `drivine`, password `drivine-test`, the datasource's database |
| Oracle   | `gvenzl/oracle-free:23-faststart` | user `drivine`, password `drivine-test`, service `FREEPDB1`  |

Neo4j, Memgraph and FalkorDB run their `latest` images, as drivine4j's and drivine-python's containers do, so a new
engine release reaches the tests as soon as it is out. Drivine's own suite runs these defaults, the same images
`@liberation-data/drivine/testing` starts for your tests (see [In Your Own Tests](#in-your-own-tests)), so an engine
release that changes what Drivine reads or writes shows up at once. To hold an engine back, pin it with
`<TYPE>_TEST_IMAGE`, for instance `MEMGRAPH_TEST_IMAGE=memgraph/memgraph:3.14.0`.

An image of a moving tag, `latest`, no tag, or a tag with no digit in it (`edge`), is pulled each time its container
starts, so a copy pulled long ago can't stand in for today's `latest`; an image of a version, a digest or a local image
id is pulled only where it is missing. An image of a moving tag that is only on your machine, built and not pushed,
can't be pulled: give it a version tag. Each container's log line says the digest of the image it ran, or its local id
where it has none.

CI runs FalkorDB's `latest` too. Its nightly run takes `ghcr.io/falkordb/falkordb:latest` in place of Docker Hub's,
with `FALKORDB_TEST_IMAGE` in [`ci.yml`](.github/workflows/ci.yml): Docker Hub's `latest` is whichever release FalkorDB
pushed last, and that was once an older line's backport, `v4.22.3` after `6.0.3`, which has no `=~`
([FalkorDB/FalkorDB#3551](https://github.com/FalkorDB/FalkorDB/issues/3551)), while ghcr.io's is FalkorDB's newest
release. Should a FalkorDB release break a pull request's run, CI pins the last good one there until FalkorDB fixes it.

## The Cypher spec

The Cypher spec's suite (`test/2.Integration/cypher`, run from `test/cypher`, see AGENTS.md) runs its statements on
Neo4j, Postgres and Oracle. On Postgres and Oracle it writes a graph of its own, `cypher`, so no other suite's nodes are
among its rows. On Neo4j it starts a container of its own, `neo4j:latest`, as drivine4j does, so a Neo4j release that
gives other rows shows up at once. It can't share the other suites' Neo4j: its statements match labels they write
(`Person`, `Movie`) while they run, and Neo4j 5, which the other suites run on when `NEO4J_TEST_IMAGE` names it,
refuses two of its statements.
`CYPHER_SPEC_NEO4J_IMAGE` picks another image; with `USE_LOCAL_NEO4J=true` it runs on your Neo4j instead, which should
be as recent. Before each case it empties the whole graph, as the spec asks, so on a local Neo4j it deletes every node
there.

## Oracle

The Oracle suites run only with `ORACLE_TESTS=true`, since the image is large and the database wants two gigabytes of
memory. Without it the global setup drops the `ORACLE` datasource, those suites are skipped, and the run says so once:

```
Oracle tests skipped: set ORACLE_TESTS=true to run them
```

```bash
ORACLE_TESTS=true npm test
```

CI runs the whole suite with `ORACLE_TESTS=true`, and again without, each split over parallel jobs with containers of
their own: `test (Oracle, parallel 1/3)` and so on, which `test (Oracle)` waits for. `DRIVINE_TEST_PART` names a job's
part, and `test/run-tests.ts` says what each runs. Most of Oracle's tests are the shared suites, which run on each
configured store, so there is no Oracle part to run alone.

A pull request's run leaves out the nightly suites, `NIGHTLY` in `test/run-tests.ts`: the timings, Oracle's plans, and
the texts past 4,000 bytes and 32 KB. They run in the full set: each night (`.github/workflows/nightly.yml`, which
opens an issue labelled `nightly` when it fails), on each push to master, in a release's gate, and on a pull request
labelled `full-ci`. A local `npm test` runs everything.

The container is the regular image and not a slim one, which has no Oracle Text: the full-text tests then search
without an index. A local instance (`USE_LOCAL_ORACLE=true`) needs an ordinary user in a pluggable database, as the
container makes: the administrators' tablespace cannot hold a graph's JSON column.

## In Your Own Tests

`@liberation-data/drivine/testing` is the same machinery, for your application's tests. Add `testcontainers` to your
dev dependencies, configure your datasources in the environment, and use Drivine's Jest hooks:

```typescript
// test/global-setup.ts
import { drivineGlobalSetup } from '@liberation-data/drivine/testing';
require('dotenv').config({ path: '.env.test' });
export default drivineGlobalSetup;

// test/global-teardown.ts
export { drivineGlobalTeardown as default } from '@liberation-data/drivine/testing';
```

```json
"jest": {
    "globalSetup": "./test/global-setup.ts",
    "globalTeardown": "./test/global-teardown.ts"
}
```

Or call `DrivineTestContainers.start()` yourself, for another test runner: it rewrites `process.env` (or the
environment you pass it) and resolves with a handle whose `stop()` stops what it started.
