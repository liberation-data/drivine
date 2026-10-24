# Test Containers

## Using Test Containers (Default)

By default, Drivine's tests start a [Testcontainer](https://node.testcontainers.org) for each datasource in
[`.env.test`](.env.test): Neo4j, Memgraph, FalkorDB and Postgres, and Oracle when asked for (see [Oracle](#oracle)).
No setup is needed beyond Docker running on the host.

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
| Neo4j    | `neo4j:5.26-community`            | user `neo4j`, password `drivine-test`                        |
| Memgraph | `memgraph/memgraph:3.12.0`        | no auth                                                      |
| FalkorDB | `falkordb/falkordb:6.0.0`         | the graph is the datasource's `DATABASE_NAME`                |
| Postgres | `pgvector/pgvector:pg16`          | user `drivine`, password `drivine-test`, the datasource's database |
| Oracle   | `gvenzl/oracle-free:23-faststart` | user `drivine`, password `drivine-test`, service `FREEPDB1`  |

## Oracle

The Oracle suites run only with `ORACLE_TESTS=true`, since the image is large and the database wants two gigabytes of
memory. Without it the global setup drops the `ORACLE` datasource, those suites are skipped, and the run says so once:

```
Oracle tests skipped: set ORACLE_TESTS=true to run them
```

```bash
ORACLE_TESTS=true npm test
```

CI runs them in a job of its own, `test (Oracle)`: the whole suite with `ORACLE_TESTS=true`. Most of Oracle's tests are
the shared suites, which run on each configured store, so there is no Oracle part to run alone.

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
