# Drivine for Python: Design

Working design for a Python port. Not a contract: update as we build.

## Summary

- **One library, three languages.** Drivine for Python does what Drivine (TypeScript) and drivine4j do: a low-level
  `PersistenceManager` that runs your statements, and a stateless object manager that loads and saves fragments and
  views, one statement per load and per save.
- **The same store.** A Python application reads and writes the same graph as a TypeScript or JVM one: the same stamp
  format, reserved properties, store identity, schema markers and Oracle tables.
- **Decided:**
  - Async first, with a sync API generated from the async source.
  - Models are Pydantic v2.
  - Python 3.11 or newer.
  - Dependency injection by [pi-pilgrim](https://github.com/liberation-data/pi-pilgrim), with no framework required.
- **Name:** `drivine` on PyPI, which is free, imported as `drivine`.

## Goals and Non-goals

Goals:

- Parity with Drivine 3.1's object manager and `PersistenceManager`, with Python-appropriate adaptations.
- Statements identical to the TypeScript backend's for the same model, so a fix on one side is a fix on the other.
- As fast as the TypeScript version: one statement per load or save, no lazy loading, no session cache.
- Typed: `py.typed`, and a query DSL that an editor can check (see [Typed references](#typed-references)).

Non-goals:

- A NestJS-style framework. Drivine plugs into FastAPI, Litestar or a plain script, and needs none of them.
- The deprecated stateful `GraphObjectManager` (session snapshots, dirty diffing). Python starts stateless.
- AgensGraph and RedisGraph, which the TypeScript version has retired.

## Engines

| Engine | Driver | `PersistenceManager` | Object manager |
|---|---|---|---|
| Neo4j | `neo4j` (async) | yes | yes |
| Memgraph | `neo4j` (async) | yes | yes |
| FalkorDB | `falkordb.asyncio` | yes | yes |
| Oracle 23ai/26ai | `oracledb` (async, thin mode) | yes | yes (SQL/PGQ backend) |
| Neptune | `neo4j` (async, Bolt) | yes | no |
| Postgres | `psycopg` 3 (async) | yes | no |

All four drivers have async APIs today: `neo4j.AsyncGraphDatabase`, `falkordb.asyncio.FalkorDB`,
`oracledb.connect_async` / `create_pool_async`, and `psycopg.AsyncConnection`. Each is an optional extra, so an
application installs only its own:

```
pip install "drivine[neo4j]"        # Neo4j, Memgraph, Neptune
pip install "drivine[falkordb]"
pip install "drivine[oracle]"
pip install "drivine[postgres]"
pip install "drivine[testing]"      # testcontainers and the pytest plugin
```

The core depends on `pydantic` and `pi-pilgrim` only.

## Package Layout

Mirrors the TypeScript `src/`, so a change can be followed from one to the other:

```
drivine/
  connection/     DatabaseRegistry, ConnectionProvider, providers per engine, DatabaseType, TransactionMode
  transaction/    transactional, transaction(), Transaction, the context
  manager/        PersistenceManager, StatelessGraphObjectManager, edges, groups, contention retry
  query/          QuerySpecification, CursorSpecification, statements, per-engine compilers
  model/          NodeFragment, RelationshipFragment, GraphView, markers, ModelRegistry, stamps
  dsl/            references, conditions, order expressions, the renderer
  backend/        GraphBackend, CypherBackend and CypherGrammar per engine, oracle/
  mapper/         rows to models, per-engine native values
  cursor/         async cursors
  schema/         SchemaCatalog, SchemaManager, IndexManager, ConstraintManager, per-engine DDL
  store/          store identity
  assembly.py     DrivineAssembly (pi-pilgrim)
  testing/        pytest plugin, testcontainers
  sync/           generated: the same API, without async
```

## Connections

Same model as TypeScript. A `DatabaseRegistry` maps a name to a `ConnectionProvider`, and `"default"` is the first one
registered:

```python
from drivine import ConnectionProviderBuilder, DatabaseRegistry, DatabaseType

registry = DatabaseRegistry()
(ConnectionProviderBuilder(registry)
    .database_type(DatabaseType.NEO4J)
    .host("localhost")
    .port(7687)
    .user_name("neo4j")
    .password(os.environ["NEO4J_PASSWORD"])
    .register("default"))

# or from the environment, with the same variables as TypeScript and the JVM:
registry.build_or_resolve_from_env()            # DATABASE_TYPE, DATABASE_HOST, ...
registry.build_or_resolve_from_env("analytics") # ANALYTICS_DATABASE_TYPE, ...
```

- The environment variables are the TypeScript ones: `[NAME_]DATABASE_TYPE`, `_HOST`, `_PORT`, `_USER`, `_PASSWORD`,
  `_NAME`, `_PROTOCOL`, `_POOL_MAX`, `_IDLE_TIMEOUT`, `_CONNECTION_TIMEOUT`, `_TRANSACTION_MODE`. One `.env` serves an
  application in any of the three languages.
- Drivine reads `os.environ` and doesn't load `.env` itself. TypeScript's module does, through dotenv. In Python
  that's the application's choice: `python-dotenv`, pydantic-settings, or the platform.
- The registry is an object, not a process singleton. `DrivineAssembly` holds the application's one.
- Defaults and per-engine behaviour follow TypeScript:
  - Default ports: Neo4j and Memgraph 7687, Neptune 8182, FalkorDB 6379 with graph `"graph"`.
  - Pool max 40, connection timeout 5 s.
  - Neptune uses a dummy auth token, TLS and a pool of one.
  - Oracle runs its graph-table DDL on first connection.
- `await registry.close()` ends every provider, at application shutdown.

## Transactions

### The decorator

```python
from drivine import transactional


class IssueService:
    def __init__(self, issues: IssueRepository, audit: AuditLog):
        self.issues = issues
        self.audit = audit

    @transactional()           # join the current transaction, or start one
    async def raise_issue(self, issue: Issue) -> Issue:
        saved = await self.issues.save(issue)
        await self.audit.record(saved)   # same transaction: another service, no plumbing
        return saved
```

- **The current transaction lives in a `ContextVar`.** That is Python's counterpart of Node's `AsyncLocalStorage`, and
  asyncio carries it across every `await`. Prototyped; it behaves as TypeScript's does.
- **The outermost call owns it.**
  - It commits when the call returns and rolls back when the call raises.
  - A nested `@transactional` call joins it.
  - The context is restored when the call ends, so nothing leaks into the next request.
- **It works on `self` calls.** pi-pilgrim makes plain objects, not proxies, and the decorator wraps the function
  itself. A method calling another `@transactional` method on `self` gets a transaction, unlike under a Spring proxy.
- **It always works.** TypeScript's `@Transactional` runs without a transaction when no Drivine context is active,
  outside a request for instance. A `ContextVar` is always there, so Python has no such case and needs no middleware.
- **Sync methods too.** The decorator sees whether it wraps a coroutine function, and the sync API's transactions use
  the same `ContextVar` (each thread has its own context).

Options:

```python
@transactional(rollback=True)                      # roll back even on success: for tests
@transactional(no_rollback_for=(NotFoundError,))   # commit although this escapes
```

**Propagation** is `REQUIRED` only, as in TypeScript, where the other six Spring values are declared but throw. Python
declares only what works. `REQUIRES_NEW` is the one worth adding later: an audit write that must survive the caller's
rollback.

### The context manager

For code that isn't a service method, such as scripts, tests and FastAPI dependencies:

```python
from drivine import transaction

async with transaction():
    await gom.save(person)
    await gom.save(team)

async with transaction(rollback=True) as tx:   # a test that leaves nothing behind
    ...
```

This replaces TypeScript's `inDrivineContext().withTransaction(...).run(...)` and `runInTransaction(fn)`. Both forms
share one implementation: the decorator is the context manager wrapped round a call.

### Concurrent tasks share it, one statement at a time

`asyncio.gather()`, `TaskGroup` and `create_task()` copy the context, so tasks started inside a transaction all join
it:

```python
@transactional()
async def import_batch(self, people: list[Person]) -> None:
    async with asyncio.TaskGroup() as tasks:
        for person in people:
            tasks.create_task(self.gom.save(person))   # all in this transaction
```

A database transaction runs one statement at a time: Neo4j's async transaction isn't safe for concurrent queries, and
an Oracle or Postgres connection serves one statement at a time. So **Drivine queues them**:

- Each connection in a transaction has an `asyncio.Lock`. A statement takes it, runs, and reads its result before
  releasing it. asyncio's lock is FIFO, so statements run in the order they were issued.
- A cursor takes the lock for each page it fetches, so a cursor and other statements interleave between pages, and
  none waits for a cursor to finish.
- **A failure in any of them marks the whole transaction rollback-only.** The owner rolls back when it ends, even if
  the failing task's error was caught. A later statement in the transaction fails at once with
  `TransactionRolledBackError`, naming the statement that failed first: the database would refuse it anyway, and
  this says why.
- Concurrency inside one transaction buys no speed. The queue keeps it correct, not parallel. For a parallel import,
  give each task its own transaction, or use `save_all`, which batches into one statement for each 1,000 fragments.

### Rollback rules

TypeScript rolls back only when an error leaves the outermost call: an inner `@Transactional` method's error, caught by
its caller, rolls nothing back, and the transaction commits what the inner method half did.

Python marks the transaction **rollback-only** whenever an exception leaves any `@transactional` call, joined or not,
unless it is listed in `no_rollback_for`. A caller may catch the error and carry on, but the transaction will roll
back, and committing raises `TransactionRolledBackError` rather than committing quietly. This is Spring's rule, and
the same rule as for concurrent tasks above.

This differs from TypeScript. See [Open questions](#open-questions).

### What a transaction holds

As in TypeScript:

- A transaction opens a connection to each database lazily, the first time it uses that database, so one transaction
  can span several databases.
- Commit is each connection's commit in turn, not a two-phase commit.
- Cursors still open are closed when the owner ends.
- FalkorDB has no multi-statement transactions. `TransactionMode.WARN`, the default, makes begin and commit do nothing
  and warns on rollback. `STRICT` refuses to begin.

## Models

### Fragments and views

Models are Pydantic v2 classes. Labels are class arguments, and field roles are `Annotated` markers:

```python
from typing import Annotated

from drivine import (Direction, GraphView, NodeFragment, NodeId, NodeStamp, Relationship, RelationshipFragment,
                     Root, TargetNode)


class Person(NodeFragment, labels=["Person"]):
    uuid: Annotated[str, NodeId()]
    name: str
    bio: str | None = None
    stamp: Annotated[str | None, NodeStamp()] = None


class Organization(NodeFragment, labels=["Organization"]):
    uuid: Annotated[str, NodeId()]
    name: str


class WorkHistory(RelationshipFragment):
    start_date: str
    role: str
    target: Annotated[Organization, TargetNode()]


class PersonCareer(GraphView):
    person: Annotated[Person, Root()]
    employment_history: Annotated[list[WorkHistory], Relationship("WORKS_FOR")] = []
```

The markers are the TypeScript decorators, renamed where Python has its own convention:

- Class arguments: `labels=[...]`.
- `Root()`, `NodeId()`, `NodeStamp()`, `TargetNode()`.
- `Relationship(type, direction=..., max_depth=...)`.
- `GraphPath([hop(...)])`, `Count(type)`, `Aggregate(...)`.
- `GraphProperty(name)`, `NodeLabels(...)`, `PropertyBag(...)`, `JsonPacked()`.
- `ReadOnly()`, `Transient()`, `SortedBy(...)`, `EmptyWhenAbsent()`.
- Schema markers: `RangeIndex`, `Unique`, `VectorIndex`, `FullTextIndex`, on the field or as class arguments.

`@Default` isn't needed: a Pydantic default applies when the property is absent. A stored null loading as the default
is a validator, which the base class provides as `Annotated[str, NullAsDefault()] = "active"`.

### What Python's types say that TypeScript's can't

TypeScript erases item types and optionality, so its decorators say them again. Python keeps both, so the type is the
whole declaration:

- **A list's item type is in the annotation.** `list[WorkHistory]` needs no `target=`.
- **Optional means optional.** A relationship typed `Person` is required: only roots that have it are loaded.
  `Person | None` is optional. TypeScript needs `required: true` because `?:` is erased.
- **Forward references are strings.** `list["LocationHierarchy"]` resolves when the class is complete, as Pydantic
  resolves it, so TypeScript's `Related<T>` and `target: () => C` thunks have no counterpart:

  ```python
  class LocationHierarchy(GraphView):
      location: Annotated[Location, Root()]
      sub_locations: Annotated[list["LocationHierarchy"], Relationship("HAS_LOCATION", max_depth=3)] = []
  ```

- **Which fields were set is known.** Pydantic's `model_fields_set` separates "never assigned" from "assigned None".
  So `NullPolicy.CLEAR` clears exactly the fields assigned None, where TypeScript can only see keys the object holds.

### Property names

Python fields are `snake_case`. TypeScript and JVM models usually store `camelCase`. A Python application sharing a
store with them must write the same names:

- By default a field is stored under its own name.
- `property_names="camel"`, a class argument or a global setting, stores `start_date` as `startDate`.
- `GraphProperty("name")` names one property.
- The DSL always uses the Python field name, and Drivine maps it, as TypeScript does for `@GraphProperty`.

This doesn't use Pydantic's `alias`, which also changes the model's JSON in FastAPI responses, and would tie the API's
field names to the graph's.

### Loading validates

The mapper turns driver values into Python ones (a Neo4j `DateTime` into a `datetime`), and the row is then
validated with `model_validate`, so a bad value fails at the load rather than later. Pydantic v2's validator is compiled Rust, so this costs microseconds per object against
milliseconds per round trip. A class may opt out with `validate_on_load=False`, which uses `model_construct`.

### Polymorphism

As in TypeScript: a subclass carries its own labels and its superclass's, and a loaded node maps to the most specific
registered subclass whose labels it carries. `ModelRegistry` finds subclasses through `__init_subclass__`.

## Object Manager

`StatelessGraphObjectManager`, made per database. The method names are TypeScript's, in snake case:

```python
gom = drivine.graph_object_manager()           # "default"

career = await gom.load(PersonCareer, uuid)
careers = await gom.load_all(PersonCareer, where=q.person.bio.contains("Lead"), limit=20)
total = await gom.count(Person)

saved = await gom.save(career)
saved = await gom.save(career, replace=["employment_history"])
saved = await gom.save(chunk, except_=["embedding"])
created = await gom.create(person)             # None when it was there
updated = await gom.update(Person, uuid, lambda it: it.model_copy(update={"name": "Ada"}))
result = await gom.patch(Session, session_id, set={"last_activity_at": now}, where=...)
results = await gom.patch_all(chunks, only=["embedding"])
await gom.save_all(views)
await gom.delete(Person, uuid, cascade=CascadeType.DELETE_ORPHAN)

nearest = await gom.load_nearest(ChunkView, vector, top_k=10)
matching = await gom.load_matching(SampleFullTextView, "graph database")

await gom.edges.unrelate(node_ref(Issue, a), node_ref(Person, b), "ASSIGNED_TO")
groups = await gom.groups.load(...)
```

- Options are keyword arguments, not an options object. `except` is a keyword, so it's `except_`, as in Python's own
  libraries.
- `update`'s change may mutate the object or return a copy (`model_copy`).
- Save semantics are TypeScript's, unchanged:
  - Add-only unless `replace`.
  - `RemovedTargets`, `NullPolicy`, `only` / `except_`.
  - Stamps and `StaleObjectError`.
  - Batches of 1,000.
  - Contention retry outside a transaction.

### Statements are ported, and checked against TypeScript

The backend (`GraphBackend`, `CypherBackend`, the per-engine `CypherGrammar`, the view projector, the save builder,
patches, cascade targets, the Oracle SQL/PGQ backend) is ported file for file. That is where the work and the engine
workarounds are: FalkorDB's bugs, Memgraph's limits, Oracle's JSON columns.

To keep the two in step:

- The TypeScript test suite writes the statement and bindings for each model and operation it covers to golden files.
- The Python suite generates the same statements from equivalent models and compares them.
- A difference fails one side's CI. A deliberate change regenerates the golden files, in the same PR.

The integration tests then run on every engine, as TypeScript's do.

## Query DSL

### References

A query is built from the class's **references**, which mirror its fields:

```python
from drivine import any_of, not_, refs

q = refs(PersonCareer)
leads = await gom.load_all(
    PersonCareer,
    where=q.person.bio.contains("Lead"),
    order_by=q.person.name.asc(),
    limit=20,
)

q = refs(Proposition)
await gom.load_all(Proposition, where=[
    q.status.eq("open"),
    any_of(q.confidence.gt(0.8), q.mentions.any(lambda m: m.resolved_id.eq(entity_id))),
    not_(q.locked.eq(True)),
])
```

- At runtime, references are objects whose `__getattr__` resolves each step against the model, as TypeScript's `Proxy`
  does. They build the same condition tree, which the ported renderers turn into Cypher or SQL.
- The vocabulary is TypeScript's, in snake case:
  - Comparison: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in_`, `not_in`.
  - Text: `contains`, `starts_with`, `ends_with`, `matches`, `contains_ignore_case`, `eq_ignore_case`.
  - Lists and nulls: `has_item`, `is_null`, `is_not_null`.
  - Ordering: `asc`, `desc`, `nulls_first`, `nulls_last`, and `after` for `seek`.
  - Logic: `any_of`, `all_of`, `not_`, and a list for AND.
  - Relationships: `any`, `none`.
  - Labels: `instance_of`, `has_any_label`.
  - Runtime keys: `property`, `predicate`.
  - Order expressions: `plus`, `minus`, `times`, `div`, `negate`, `exp`, `floor`, `coalesce`, `epoch_seconds`,
    `case_of`.
- Methods, not overloaded operators. `q.age > 30` reads well, but `q.name == "Ada"` returning a condition rather than
  a bool surprises in `if` statements and tests, and `in` can't be overloaded at all. Operators can come later as
  sugar.
- `where` also takes a raw predicate over `n` with `bindings`, as in TypeScript.
- Index advice (`OFF`, `WARN`, `FAIL`) works as in TypeScript, and is logged through `logging`.

### Typed references

`refs(PersonCareer)` is typed as `Refs[PersonCareer]`, which a type checker sees as untyped. Python's type system
can't derive "a reference type for each field" from a class, so checking needs generated code, as drivine4j uses KSP:

```
python -m drivine.refs myapp/models.py     # writes myapp/models_refs.pyi
```

The stub declares a reference class per model, `PersonCareerRefs` with `person: PersonRefs`, `bio: TextRef`, and so
on, and an overload of `refs` for each model. With it, pyright and mypy reject `q.person.bio.gt(3)` and
`q.person.nmae`, and editors complete field names. Without it, everything still runs, and a misspelt field fails when
the query is built, naming the field and the model.

This is a later milestone. The runtime references come first.

## PersistenceManager

The low-level API, as in TypeScript:

```python
from drivine import QuerySpecification

spec = (QuerySpecification[Person]()
    .with_statement("MATCH (p:Person {city: $city}) RETURN properties(p)")
    .bind({"city": "Sydney"})
    .transform(Person)          # any type Pydantic can validate: a model, a TypedDict, a dataclass
    .filter(lambda it: it.age >= 18)
    .limit(10))

people = await pm.query(spec)
person = await pm.get_one(spec)          # exactly one, or it raises
maybe = await pm.maybe_get_one(spec)     # one or None
await pm.execute(spec)
```

`transform` validates through a Pydantic `TypeAdapter`, so it takes anything Pydantic does. TypeScript uses
class-transformer.

### Cursors stream

```python
async with pm.open_cursor(CursorSpecification[Route]().with_statement(statement).batch_size(100).transform(Route)) as cursor:
    async for route in cursor:
        ...
```

- On Neo4j, Memgraph and Neptune a cursor reads the driver's result as it arrives, with the driver's fetch size. That
  is true streaming. TypeScript's Neo4j cursor re-runs the statement with SKIP and LIMIT for each page.
- On FalkorDB it pages, as TypeScript does: the protocol returns whole results.
- Oracle and Postgres use their drivers' cursors.
- **A cursor works outside a transaction.** It opens its own connection and closes it on exit. TypeScript's
  non-transactional manager doesn't implement `openCursor`.

### Statements in files

```python
from drivine import cypher_statement

routes_between = cypher_statement(__package__, "routes_between.cypher")
```

Statements are read with `importlib.resources`, so they work from an installed wheel or a zip, as `require.resolve`
does for TypeScript.

## Dependency Injection with pi-pilgrim

`DrivineAssembly` is a pi-pilgrim assembly that provides the registry and the managers. An application's assembly
uses it, and its own classes take what they need in their initializers:

```python
from pipilgrim import AssemblyHolder, PilgrimAssembly
from drivine import DrivineAssembly


class AppAssembly(PilgrimAssembly):
    def __init__(self):
        self.drivine = AssemblyHolder.shared(DrivineAssembly)
        super().__init__()

    def issue_repository(self) -> IssueRepository:
        return self.shared(lambda: IssueRepository(self.drivine.graph_object_manager()))

    def report_repository(self) -> ReportRepository:
        return self.shared(lambda: ReportRepository(self.drivine.persistence_manager("analytics")))

    def issue_service(self) -> IssueService:
        return self.shared(lambda: IssueService(self.issue_repository(), self.audit_log()))
```

- `graph_object_manager(database="default")` and `persistence_manager(database="default")` are `shared` components
  named by their arguments, which pi-pilgrim 0.2 supports. Each database gets one manager, and
  `graph_object_manager()` and `graph_object_manager("default")` are the same one.
- By default `DrivineAssembly` registers its connections from the environment. To register them in code, subclass it
  and override `connection_providers()`. Overriding a method is how a pilgrim assembly is changed, in tests as well.
- `Assembled` injects Drivine's components into classes made by a framework, by type or by key:
  `gom: StatelessGraphObjectManager = Assembled()`.
- Nothing in Drivine requires pi-pilgrim at use. The managers are plain classes, so an application with another
  container, or none, constructs them itself.

### FastAPI

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    assembly = AssemblyHolder.shared(AppAssembly)
    await assembly.drivine.start()     # connect, enforce the schema catalog
    yield
    await assembly.drivine.close()

app = FastAPI(lifespan=lifespan)
```

There's no transaction middleware to install: `@transactional` works without one. An endpoint that should be one
transaction is a `@transactional` service method, or opens `async with transaction()`.

## Sync API

`drivine.sync` is the same API without `async` and `await`, for scripts, notebooks, Django and Flask.

- It is generated from the async source by an unasync step at build time, as the Neo4j Python driver generates its
  own sync API.
- Each sync class uses its driver's sync client, not an event loop behind it, so it costs nothing extra and works
  where a loop is already running, as in Jupyter.
- One source, two APIs. A fix is written once, and CI checks the generated code is up to date.

It comes after the async API is complete, not alongside it.

## Schema, Store Identity, Testing, Logging

- **Schema:**
  - `SchemaCatalog`, `SchemaManager.enforce()`, `IndexManager` and `ConstraintManager`, with per-engine DDL, are
    ported as they are.
  - `SchemaCatalog.from_fragments(...)` reads the schema markers.
  - `DrivineAssembly.start()` enforces the catalog, where TypeScript's module does at startup.
- **Store identity:** the `(:DrivineStore {key: 'singleton'})` node, minted and read as TypeScript and the JVM do.
- **Testing** (`drivine[testing]`):
  - A pytest plugin starts testcontainers for the engines the environment names, Neo4j, Memgraph, FalkorDB and
    Oracle, and points the environment at them, as `drivineGlobalSetup` does for Jest.
  - A `drivine_transaction` fixture runs each test in a transaction that rolls back.
- **Logging:**
  - The standard `logging` module, as loggers `drivine` and `drivine.statements`.
  - Each statement is logged at DEBUG with its session id and elapsed time.
  - `DRIVINE_LOG_LEVEL` is honoured when the application hasn't configured logging.
- **Errors:** Python's naming, all subclasses of `DrivineError`: `StaleObjectError`, `NonAtomicBatchError`,
  `TransactionRolledBackError`.

## Same Store as TypeScript and the JVM

A Python port must write what the others read. These are the formats, from the TypeScript source:

- **Stamps:** `__drivine.stamp = "<data 16 hex>:<links 16 hex>"`, with the TypeScript restamp and relink rules, and
  the `__drivine.lock` write lock in checked saves (`src/model/Stamps.ts`, `src/backend/CypherStamps.ts`).
- **The reserved prefix** `__drivine.`. An open `@NodeLabels` set records its labels under
  `__drivine.labels.<field>`.
- **Property bags'** prefix and delimiter layout, and JSON-packed fields.
- **FalkorDB vectors** stored with `vecf32`, dates as padded ISO strings with nine fractional digits.
- **Store identity** and the `_DrivineSchema` marker nodes, with their version and inventory.
- **Oracle:** the `<graph>_node`, `<graph>_edge` and `<graph>_schema` tables, the property graph over them, and the
  vector and text side tables (`src/backend/oracle/`).
- **Property names:** see [Property names](#property-names).

An integration test writes with one language and reads with the other, on each engine, for each of these.

## Differences from TypeScript

| | TypeScript | Python |
|---|---|---|
| Transaction outside a request | runs without one, silently | always transactional |
| Inner error caught by the caller | commits | rolls back (rollback-only) |
| Concurrent statements in a transaction | unguarded | queued, FIFO |
| `self` call to a `@transactional` method | transactional | transactional |
| Cursor outside a transaction | not implemented | own connection |
| Neo4j cursor | re-queries per page | streams |
| List item type | `target: () => C` | from the annotation |
| Required relationship | `required: true` | not `Optional` |
| `NullPolicy.CLEAR` | keys the object holds | fields assigned None |
| Typed query references | from the compiler | generated stubs |
| DI | NestJS | pi-pilgrim, or none |

## Milestones

Each milestone ends with tests passing on every engine it covers, and is releasable.

1. **Connections and `PersistenceManager` on Neo4j.**
   - The registry and environment configuration, query specifications, mapping and cursors.
   - `DrivineAssembly`, the pytest plugin and testcontainers.
2. **Transactions.** The decorator and context manager, the queue, rollback-only, and spanning several databases.
3. **Models and loading.**
   - Fragments, views, relationships, recursion, paths and aggregates.
   - `ModelRegistry`, polymorphism, and the view projector.
   - Golden statements against TypeScript start here.
4. **Saving.** Save, stamps, `replace`, `create`, `update`, `patch`, batches, delete and cascade, and edges.
5. **The query DSL.** References, conditions, ordering, `seek`, groups and index advice.
6. **Memgraph, FalkorDB and Neptune.** The grammars and the workarounds.
7. **Search and schema.** Vectors, full-text, and schema management. Store identity.
8. **Oracle.** The SQL/PGQ backend.
9. **Typed reference stubs.**
10. **The sync API.**
11. **Docs:** a Python topic on drivine.org beside TypeScript and Kotlin & Java, with the landing page's sample in
    Python, tested like the other two.

## Open Questions

- **Where it lives.** Recommended: its own repository, `liberation-data/drivine-py`, with its own CI and releases,
  and the golden statements published from this repository's CI as an artifact. A directory here would keep the two
  in one PR, but tie Python's releases to npm's.
- **Rollback-only on a caught inner error.** Recommended for Python, as above. Should TypeScript change to match? It
  is a behaviour change there, so it would wait for a major version.
- **Default property naming.** Field names as written (recommended), or camel case by default so a store matches
  TypeScript's without configuration?
- **`REQUIRES_NEW`** in the first release, or later?
- **Validation on load** by default (recommended), or `model_construct` by default for speed?
- **The stub generator:** a standalone script (recommended: it works with every checker) or a mypy plugin, which
  pyright can't use.
