## Testing

`RunWithDrivine` runs each test of a file in its own transaction, rolled back at its end, so tests leave nothing behind:

```typescript
RunWithDrivine({ rollback: true });

describe('RouteRepository', () => {
    it('finds the fastest route', async () => {
        // …
    });
});
```

FalkorDB has no transactions to roll back: clear what a test wrote yourself.

### Test Containers, or a Local Instance

`@liberation-data/drivine/testing` starts a [Testcontainer](https://node.testcontainers.org) for each datasource your
test environment configures, and points the datasource at it: Neo4j, Memgraph, FalkorDB, Postgres and Oracle. While you
iterate, `USE_LOCAL_<TYPE>=true` uses an instance of your own in that type's place, so nothing starts and you can look at
what a test left behind. It is drivine4j's `@EnableDrivineTestConfig`. Add `testcontainers` to your dev dependencies, and
make it Jest's global setup and teardown:

```typescript
// test/global-setup.ts
import { drivineGlobalSetup } from '@liberation-data/drivine/testing';
require('dotenv').config({ path: '.env.test' });
export default drivineGlobalSetup;

// test/global-teardown.ts
export { drivineGlobalTeardown as default } from '@liberation-data/drivine/testing';
```

```bash
npm test                          # a container for each datasource
USE_LOCAL_NEO4J=true npm test     # Neo4j at DATABASE_HOST:DATABASE_PORT, the others in containers
```

Datasources of one type share a container. `<TYPE>_TEST_IMAGE` picks another image. See
[TEST_CONTAINERS.md](../TEST_CONTAINERS.md), which also covers running Drivine's own suite.
