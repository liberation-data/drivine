# Test Containers

## Using Test Containers (Default)

By default, Drivine's tests start a [Testcontainer](https://node.testcontainers.org) for each datasource in
[`.env.test`](.env.test): Neo4j, Memgraph, FalkorDB and Postgres, and Oracle when asked for (see [Oracle](#oracle)).
No setup is needed beyond Docker running on the host.

```bash
npm test
```

The containers start once per run, in Jest's global setup, before any test file. The datasource's host and port, and the
user, password and database where the container fixes them, are rewritten to reach the container, and the workers Jest
forks inherit them. They stop in the global teardown; Testcontainers' reaper removes them should the run die.

## Using a Local Database Instance

To skip a container and use an instance you keep running, set `USE_LOCAL_<TYPE>=true` for its type. That type's
datasources then use their settings in `.env.test` as they are, so put your instance's host, port and credentials
beside the flag in `.env.test.local`, which git ignores and which wins over `.env.test`. The shell wins over both.

| Backend  | Flag                      | Settings it uses as they are                                    |
|----------|---------------------------|-----------------------------------------------------------------|
| Neo4j    | `USE_LOCAL_NEO4J=true`    | `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`, `DATABASE_PASSWORD` |
| Memgraph | `USE_LOCAL_MEMGRAPH=true` | `MEMGRAPH_DATABASE_HOST`, `MEMGRAPH_DATABASE_PORT`              |
| FalkorDB | `USE_LOCAL_FALKORDB=true` | `FALKORDB_DATABASE_HOST`, `FALKORDB_DATABASE_PORT`              |
| Postgres | `USE_LOCAL_POSTGRES=true` | `POSTGRES_DATABASE_*`                                           |
| Oracle   | `USE_LOCAL_ORACLE=true`   | `ORACLE_DATABASE_*`                                             |

```bash
# .env.test.local
USE_LOCAL_NEO4J=true
DATABASE_PORT=17687
```

Each type is chosen alone: a local Neo4j can run beside a FalkorDB container. `<TYPE>_TEST_IMAGE` (`NEO4J_TEST_IMAGE`,
`ORACLE_TEST_IMAGE`, …) picks another image for a type's container.

| Backend  | Image                             | Container's settings                                         |
|----------|-----------------------------------|--------------------------------------------------------------|
| Neo4j    | `neo4j:5.26-community`            | user `neo4j`, password `drivine-test`                        |
| Memgraph | `memgraph/memgraph:latest`        | no auth                                                      |
| FalkorDB | `falkordb/falkordb:latest`        | the graph is the datasource's `DATABASE_NAME`                |
| Postgres | `postgres:16`                     | user `drivine`, password `drivine-test`, the datasource's database |
| Oracle   | `gvenzl/oracle-free:23-faststart` | user `drivine`, password `drivine-test`, service `FREEPDB1`  |

## Oracle

The Oracle suites run only with `ORACLE_TESTS=true`, since the image is large and the database wants two gigabytes of
memory. Without it the global setup drops the `ORACLE` datasource, and those suites are skipped.

```bash
ORACLE_TESTS=true npm test -- oracle
```

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
