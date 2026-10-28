## Quick Start

### 1. Configuration

Connections come from the environment, or a `.env` file that Drivine loads. The default database is configured with
`DATABASE_*`, and a named one with `<NAME>_DATABASE_*`:

```bash
DATABASE_TYPE=NEO4J          # NEO4J, MEMGRAPH, FALKORDB, ORACLE, NEPTUNE or POSTGRES
DATABASE_HOST=localhost
DATABASE_PORT=7687
DATABASE_USER=neo4j
DATABASE_PASSWORD=password
DATABASE_NAME=neo4j          # optional on the graph engines; on Oracle, the service, e.g. FREEPDB1
DATABASE_POOL_MAX=40
DATABASE_CONNECTION_TIMEOUT=5000
```

Use them through Nest's module, or without Nest. Only the setup differs: the decorators, the DSL, `@Transactional`
and the managers are the same.

### 2. With Nest

Register the connections with the module, from `@liberation-data/drivine/nest`:

```typescript
import { DrivineModule } from '@liberation-data/drivine/nest';

@Module({
    imports: [
        DrivineModule.withOptions({
            connectionProviders: [DatabaseRegistry.buildOrResolveFromEnv()]
        })
    ],
    providers: [RouteRepository, PersonService]
})
export class AppModule {}
```

Then inject a persistence manager, an object manager or a statement. The `Inject…` decorators come from
`@liberation-data/drivine/nest` too; everything else from `@liberation-data/drivine`:

```typescript
@Injectable()
export class RouteRepository {
    constructor(
        @InjectPersistenceManager() readonly persistenceManager: PersistenceManager,
        @InjectCypher(__dirname, 'routesBetween') readonly routesBetween: CypherStatement
    ) {}

    @Transactional() // Propagation.REQUIRED by default: join the current transaction, or start one.
    async findFastestBetween(start: string, destination: string): Promise<Route> {
        return this.persistenceManager.getOne(
            new QuerySpecification<Route>()
                .withStatement(this.routesBetween)
                .bind([start, destination])
                .limit(1)
                .transform(Route)
        );
    }
}
```

Or, with the object manager, declare what you want and let Drivine write the statement:

```typescript
@Injectable()
export class PersonService {
    constructor(@InjectGraphObjectManager() readonly gom: StatelessGraphObjectManager) {}

    async leads(): Promise<PersonCareer[]> {
        return this.gom.loadAll(PersonCareer, (q) => ({ where: q.person.bio.containsIgnoreCase('lead') }));
    }
}
```

The module closes the connections when the application stops.

### 3. Without Nest

In Express, Fastify, a job or a CLI, make the factories yourself, once, and hand the managers to your classes:

```typescript
import {
    cypherStatement,
    DatabaseRegistry,
    GraphObjectManagerFactory,
    inDrivineContext,
    PersistenceManager,
    PersistenceManagerFactory,
    QuerySpecification,
    StatelessGraphObjectManager,
    Transactional
} from '@liberation-data/drivine';
import { readFileSync } from 'fs';

DatabaseRegistry.buildOrResolveFromEnv();                  // and buildOrResolveFromEnv('ANALYTICS'), …
const persistenceManagers = new PersistenceManagerFactory();
const graphObjectManagers = new GraphObjectManagerFactory(persistenceManagers);

export class RouteRepository {
    private readonly routesBetween = cypherStatement(readFileSync(`${__dirname}/routesBetween.cypher`, 'utf8'));

    constructor(readonly persistenceManager: PersistenceManager = persistenceManagers.get()) {}

    @Transactional() // the same as in Nest: join the current transaction, or start one
    async findFastestBetween(start: string, destination: string): Promise<Route> {
        return this.persistenceManager.getOne(
            new QuerySpecification<Route>()
                .withStatement(this.routesBetween)
                .bind([start, destination])
                .limit(1)
                .transform(Route)
        );
    }
}

export class PersonService {
    constructor(readonly gom: StatelessGraphObjectManager = graphObjectManagers.get()) {}

    async leads(): Promise<PersonCareer[]> {
        return this.gom.loadAll(PersonCareer, (q) => ({ where: q.person.bio.containsIgnoreCase('lead') }));
    }

    @Transactional()
    async hire(person: Person): Promise<void> {
        await this.gom.save(person);
    }
}
```

**`@Transactional` needs no setup.** Drivine keeps the transaction in Node's `AsyncLocalStorage`, which follows every
`await`. A marked method starts a transaction when none is running, and every marked method it calls, in any class,
joins it. Nothing passes a transaction or a context around:

```typescript
class AuditLog {
    constructor(readonly gom: StatelessGraphObjectManager = graphObjectManagers.get('AUDIT')) {}

    @Transactional()
    async record(event: AuditEvent): Promise<void> {
        await this.gom.save(event);
    }
}

class Onboarding {
    constructor(readonly people = new PersonService(), readonly audit = new AuditLog()) {}

    @Transactional()
    async onboard(person: Person): Promise<void> {
        await this.people.hire(person);                           // joins onboard's transaction
        await this.audit.record(AuditEvent.hired(person));        // so does this, on another database
    } // both commit here; a throw anywhere in it rolls both back
}
```

To run a block in one transaction without a decorator:

```typescript
await inDrivineContext()
    .withTransaction()
    .run(async () => { /* … */ });
```

Close the connections when the application stops:

```typescript
await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
```

### Return One Map

When you write a statement yourself, return a **single map** or a **scalar**, not several columns. That maps cleanly
with `.transform()` and avoids trouble with nulls:

```cypher
-- Wrong: several columns, awkward to map
RETURN a.name, a.age, b.title

-- Right: one map
RETURN { name: a.name, age: a.age, title: b.title } AS result

-- Right: a node's properties, or a scalar
RETURN properties(p)
RETURN count(p) AS total
```
