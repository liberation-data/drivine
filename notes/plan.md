# Drivine: Plan to Match drivine4j

Working notes — not a contract. Update as we go.

## Where we are

- Current branch: `master` at v2.8.2
- Engines on master: AgensGraph, Neo4j (BOLT), Postgres (plain SQL), Neptune (basic — single connection, noted TODO in `2e83e59`)
- Target: feature parity with **drivine4j 0.1.7** (was 0.0.30 when this plan was first written, 2026-04-26), with Node-appropriate adaptations, for the **graph** engines
- drivine4j engine set (`DatabaseType`): `NEO4J`, `NEPTUNE`, `FALKORDB`, `MEMGRAPH` (Cypher); `POSTGRES`, `ORACLE` (SQL); `EMBABEL` (in-process)
- AgensGraph is being retired (has fallen behind upstream); not in the target engine set
- RedisGraph is dropped from the target: Redis EOL'd it, drivine4j never had it, and FalkorDB is its maintained fork (same wire protocol)
- Oracle (23ai/26ai, SQL/PGQ) is in the target, as a second, non-Cypher backend for the stateless manager (Tier 5)
- Postgres is plain SQL — stays on `PersistenceManager` only until Postgres ships SQL/PGQ (Tier 5)
- `EMBABEL` (in-process engine type) is not needed on Node

One thing the JVM version does NOT have: streaming cursors with no back-pressure. Keep this front-and-centre — it's a genuine Node-side differentiator.

### What changed in drivine4j since 0.0.30 (why this plan was rewritten)

- **`StatelessGraphObjectManager` (0.1.0)** is now the primary API. The stateful `GraphObjectManager` (session snapshot + dirty diffing + `CascadeType`) is **deprecated** — it produced real data-loss bugs whenever anything else wrote to the graph. Saves now depend only on the object and the arguments passed.
- **`@NodeStamp`** optimistic concurrency: a save is refused when another writer got there first. Every saved node carries `__drivine.stamp`.
- **New write API**: `save`, `saveAll` (with `only` / `except`, atomic on FalkorDB or refused up front), `update(id) { copy }`, `create` (create-if-absent, first write never overwritten), `patch` / `patchAll` (named fields, conditional on a predicate), `edges`, `Replace(...)` with `RemovedTargets.DELETE_UNREFERENCED`, `NullPolicy`.
- **Read-only view fields**: `@ReadOnly`, `@GraphPath`, `@Count`, `@Aggregate`, multi-hop lists.
- **Search**: vector (`loadNearest`, `searchK`, threshold, partitioning, filtered) and full-text (`loadMatching`).
- **Model**: `@GraphProperty` (name mapping), `@PropertyBag`, `@NodeLabels`, relationships of a runtime type, `@Default`, `@EmptyWhenAbsent`, `@GraphTransient`, `@Hop`, inherited `@NodeId`.
- **Queries**: `groups` (group by key with aggregates), `any` / `none` over to-many, `hasItem`, dynamic/runtime-key predicates, limit/skip, index-aware keyset pagination, `nullsFirst()` / `nullsLast()`, order by expression over root properties, database-side ordering of nested collections.
- **Schema management**: `IndexManager`, `ConstraintManager`, `SchemaCatalog`, decorator-declared `@Unique` / `@RangeIndex` / `@VectorIndex` / `@FullTextIndex`, `SchemaManager` runtime enforcement, version-triggered rebuild, per-engine `SchemaGrammar`.
- **Store identity**: a store has a stable identity independent of its address; a manager can say which store it is on.
- **Backend abstraction**: `GraphBackend` interface with `CypherBackend` (+ per-engine `CypherGrammar`) and `OracleBackend` (SQL/PGQ). The object manager generates via the backend, not directly as Cypher.
- **Oracle** SQL/PGQ backend for the stateless manager. Postgres-as-graph (LATERAL + `json_agg`) exists as a proposal only.
- **Ops**: contended-retry with jitter, in-process engines register their own `ConnectionProvider`, FalkorDB parameterisation + DDL fixes.

## The redis branch — re-evaluated

- Merge base with master: `de6b348`; master is +63 ahead, redis branch +1 (`625ebc6 RedisGraph support`), but cumulative diff is **+9188 / -17920 across 89 files** (dir reorg, Neptune deletion, lockfile churn, test refactor, `resultset/`, `LocalStorageClsHooked.ts`).

**Decision: don't merge, don't cherry-pick, and don't ship RedisGraph.** Use the redis-branch files (`RedisGraphConnection.ts`, `RedisGraphConnectionProvider.ts`, `RedisGraphResultMapper.ts`, `RedisGraphResultSet.ts`) as **reference for the FalkorDB engine**, which speaks the same protocol.

## The transaction-mode decision (locked in)

Still present in drivine4j 0.1.7 (`ConnectionProperties`, `FalkorDbConnection`, `NonAtomicBatchException`). Mirror on Node:

```ts
type TransactionMode = 'WARN' | 'STRICT'

interface ConnectionProperties {
  // ...existing fields...
  transactionMode?: TransactionMode  // default WARN
}
```

For engines without multi-statement transactions (FalkorDB):
- `WARN` (default): `startTransaction` is no-op debug log, `rollback` warns, queries auto-commit
- `STRICT`: `startTransaction` throws, so `@Transactional` methods fail at their first statement. `commit` is a no-op and `rollback` only warns: rollback runs on the error path and must not hide the original error (as in drivine4j)
- A batch that can't be atomic is written as one statement or refused up front (`NonAtomicBatchException` equivalent)

As in drivine4j, this is a per-connection concern: an auto-commit engine's connection delegates to a shared `AutoCommitTransactions` helper. `Transaction.ts` needs no change.

---

## Tier 0 — AgensGraph removal (prep)

Drop `AgensGraphConnection`, `AgensGraphConnectionProvider`, `AgensGraphCursor`, `AgensGraph*ResultMapper`, `AgensGraphSpecCompiler`, `AgensGraphResultSet`, `@bitnine-oss/ag-driver` dep, and all Agens tests. Update `DatabaseRegistry`, `DatabaseType`, README.

Verify Postgres path is fully independent of Agens code (shared `pg` driver, possibly shared plumbing). Untangle in the same PR if needed.

One PR, mechanical, lands before Tier 1.

## Tier 1 — Engines + backend abstraction

Goal: Neo4j 4/5, FalkorDB, Memgraph, Neptune (full IAM SigV4) selectable by config as **graph** engines. Postgres preserved as plain-SQL on `PersistenceManager`.

### Steps

1. **`TransactionMode`** on `ConnectionProperties` + integration into `Transaction.ts` and `TransactionalPersistenceManager.ts`. Tests for both modes.

2. **Connection-dir reorganisation** — `src/connection/<engine>/` (`neo4j/`, `postgres/`, `neptune/`). `git mv`, pure moves + import updates. New engines land directly into the new structure.

3. **`GraphBackend` + `CypherGrammar` abstraction** — mirror drivine4j rather than the earlier ad-hoc `CypherDialect` sketch. `GraphBackend` owns statement generation for load / count / groups / nearest / matching / delete / save, plus capability flags (`supportsOrphanDelete`, `supportsIndexBackedOrdering`, ...). `CypherBackend` is the one implementation for now, parameterised by a per-engine `CypherGrammar` (`EXISTS {}` vs `size()`, APOC vs CALL-subquery sort, pattern comprehension vs CALL prolog, temporal literals, quoting). Keeping the `GraphBackend` seam leaves room for SQL backends later (Tier 5) without rework.

4. **FalkorDB engine** — Redis protocol, built from redis-branch reference. `WARN` default. Every value sent as a parameter (drivine4j #30), nine-digit time precision, quoting of non-plain names in DDL.

5. **Memgraph engine** — Bolt, reuses Neo4j driver stack; grammar differs (no APOC, CALL-subquery sort).

6. **Neptune full** — IAM SigV4 (`NeptuneAuthMode`, token refresh; `@aws-sdk/signature-v4` already in deps) + connection pool for the "1 txn per connection" limit noted in `2e83e59`.

7. **Contended-retry with jitter** — retry transient conflicts with a random pause component so two writers that collided don't retry in lockstep.

8. **`@JsonPacked`** — collection-as-JSON property decorator (Neptune list-property workaround). Cross-engine safe.

### Acceptance

- Engines selectable via `ConnectionProperties.databaseType`: Neo4j, Memgraph, FalkorDB, Neptune (graph); Postgres (SQL)
- Integration tests pass against each via Testcontainers (where available)
- Existing Neo4j / Postgres / Neptune-basic tests still pass after AgensGraph removal

---

## Tier 2 — Stateless GraphObjectManager

Goal: decorator-driven object mapping alongside (not replacing) `PersistenceManager`. **Build the stateless manager directly** — skip the deprecated stateful `GraphObjectManager` (session, dirty tracking, `CascadeType`) entirely. Node users have no legacy data to migrate, so none of drivine4j's repair tooling (`RelationshipDirectionRepair`, `PathRelationshipReport`) is needed.

### Decorators (TS decorators + reflect-metadata)

- Class: `@NodeFragment({ labels })`, `@RelationshipFragment`, `@GraphView`
- Identity/state: `@Root`, `@NodeId` (inheritable), `@NodeStamp`, `@ReadOnly`, `@GraphTransient`
- Relationships: `@GraphRelationship({ type, direction, maxDepth, required })`, `@GraphPath` + `@Hop`, relationships of a runtime type
- Derived: `@Count`, `@Aggregate(fn)`
- Mapping: `@GraphProperty(name)`, `@PropertyBag`, `@NodeLabels`, `@JsonPacked`, `@Default`, `@EmptyWhenAbsent`
- Ordering: `@SortedBy(propertyPath, ascending?)` (client-side)

### Read API (`GraphObjectOperations`)

```ts
gom.loadAll(PersonCareer, q?)
gom.load(PersonCareer, id)
gom.loadFirst(PersonCareer, q)
gom.count(PersonCareer, q?)
gom.groups(Issue, q)            // group by key with aggregates
gom.delete(PersonCareer, id)
gom.deleteAll(Issue, q | "n.state = 'closed'")
```

Filter API is string-based until Tier 4 lands the type-safe DSL.

### Write API (on the manager class itself, no interface — as in drivine4j)

```ts
gom.save(obj, Replace(View.attachments, { removedTargets: 'DELETE_UNREFERENCED' }))
gom.saveAll(objs, { only: [...] } | { except: [...] })
gom.update(PersonCareer, id, p => ({ ...p, title: 'Lead' }))
gom.create(obj)                 // create-if-absent
gom.patch(Person, id, { fields }, where?)
gom.patchAll(Person, q, { fields })
gom.edges(...)                  // write/remove relationships directly
```

- `NullPolicy` for how `null` fields are written
- `@NodeStamp`: every saved node (and each end of a written/removed relationship) carries `__drivine.stamp`; a stale save throws `StaleObjectException`; `save` returns the new stamp
- Read-only fields (`@GraphPath`, `@Count`, `@Aggregate`, multi-hop lists) are never written
- `INCOMING` relationships written in their declared direction (drivine4j's pre-0.1.0 bug — don't repeat it)

### Subsystems

- **Statement generation** — walks view metadata → `GraphBackend` (Tier 1). The heart of the work.
- **Result deserialiser** — single nested-map column → instance. Polymorphism (label discrimination), recursion termination, optional vs required.
- **Required vs optional** — explicit `required: true` on `@GraphRelationship` (`design:type` can't see `?:`). Required emits an existence filter.
- **Recursive views** — detect self-reference/cycles, nest to `maxDepth`; terminal collections `[]`, singles `null`. Query-time depth override.
- **Polymorphism** — no sealed classes in TS: abstract class + decorated subclasses, plus `registerSubtype(parent, labelKey, subtype)` for the interface case; `instanceOf` filter via runtime metadata.

### Acceptance

- `@GraphView` with `@Root`, optional + required + recursive + polymorphic relationships, a `@GraphPath` and a `@Count`
- Concurrent writers: second stale save refused via `@NodeStamp`
- `Replace` + `DELETE_UNREFERENCED` keeps shared targets, deletes unreferenced ones
- `saveAll` atomic on FalkorDB or refused up front
- Same scenarios leave identical graphs on Neo4j, Memgraph and FalkorDB (drivine4j's comparison-test approach)

---

## Tier 3 — Search + schema management

Split out of Tier 2 because both are sizeable and independently useful (especially for RAG users).

**Search**
- `loadNearest(View, vector, { topK, threshold, searchK, partitionLabel, where })` — vector search returning `Scored<T>`. Expose `searchK` (effective k) so filtered callers can over-fetch: filters apply after the ANN yield, and HNSW under-recalls at small k on clustered data (see drivine4j `docs/next-feature.md`).
- `loadMatching(View, text, { topK, threshold, where })` — full-text search.
- Per-engine vector storage (e.g. FalkorDB `vecf32`).

**Schema**
- Imperative `IndexManager` / `ConstraintManager`
- Declarative `SchemaCatalog` provider and decorators: `@Unique`, `@RangeIndex`, `@VectorIndex`, `@FullTextIndex`
- `SchemaManager` runtime enforcement with `SchemaMode` / `SchemaPolicy`; version-triggered rebuild via a stored schema version
- Per-engine `SchemaGrammar` (Neo4j, Memgraph, FalkorDB; unsupported → explicit error)
- Let `@VectorIndex` pin quantization and HNSW params so a declared schema is reproducible across server versions
- `PersistenceManager.canManageSchema()`

**Store identity** — stable `StoreIdentity` independent of address, safe under concurrent first boots; manager can report its store.

---

## Tier 4 — Type-safe DSL (codegen)

Goal: `loadAll(View, q => q.where(q.person.bio.contains("Lead")))` with autocomplete and compile-time checking.

**Approach (changed in 4.1): typed references from the model classes, no codegen.** A query is a function of references derived from the class's own type with mapped types (`Refs<T>`): a string field offers string tests, a number or Date ordering, a list `hasItem`, an object (a view's root, a relationship's nodes, a property bag's entries) its own fields. At run time a Proxy walks the model as fields are reached, so a field the model can't query fails naming it. This gives drivine4j's generated-DSL typing (autocomplete, compile errors) without a build step or generated files to keep in step. (Was: ts-morph codegen, rejected then on the belief that runtime proxies lose nested types — mapped types keep them.)

```ts
gom.loadAll(IssueView, (q) => ({
    where: [q.issue.state.eq('open'), q.assignees.any((a) => [a.role.eq('lead'), a.person.name.eq('Kent')])],
    orderBy: [q.issue.priority.desc().nullsLast(), q.issue.id.asc()],
    limit: 20
}))
```

Operators: `eq, neq, gt, gte, lt, lte, in, notIn, contains, startsWith, endsWith, matches, containsIgnoreCase, eqIgnoreCase, isNull, isNotNull, hasItem, instanceOf`; `any` / `none` over to-many relationships; dynamic runtime-key predicates.

Composition: a `where` array = AND; `anyOf(...)` = OR; `allOf(...)`; `not(...)`. Bare-fragment queries supported.

Ordering & paging: `asc`, `desc`, `nullsFirst()`, `nullsLast()`, order by expression over root properties, database-side ordering of nested collections, `limit` / `skip`, index-aware keyset pagination.

Also drives `groups`, `deleteAll`, `loadNearest` / `loadMatching` filters, `patch` conditions.

**Defer** until Tier 2 is shipped and stable — the runtime API works without it.

---

## Tier 5 — SQL/PGQ backends

### Oracle (planned)

Port drivine4j's `OracleBackend` (see `drivine4j/docs/oracle-sql-pgq-plan.md`, phases 1–7 done). Target Oracle Database 23ai / 26ai.

- Driver: `node-oracledb` in thin mode (no Instant Client). A generic SQL connection substrate (drivine4j's `JdbcConnection` equivalent) shared with Postgres.
- Scope: everything on `GraphObjectOperations` plus `save`, `saveAll`, `update`, `edges` on the stateless manager.
- Reads: `GRAPH_TABLE` queries; path reads from the root; filters on indexed properties go through the index.
- Writes: one PL/SQL block per save with `FOR UPDATE` (drivine4j's write spike shows dropping it breaks concurrent saves); `@NodeStamp` checks; whole-or-nothing without a transaction.
- Schema: `OracleSchemaGrammar`, schema marker, Oracle Text full-text with documented differences from Lucene, Oracle vector type.
- Port the spike tests first (`OracleWriteSpikeTest` scenarios) as acceptance, run in their own CI job (Oracle Free container).

Comes after Tier 2 is stable; it implements the same contract and is the real test of the `GraphBackend` seam.

### Postgres (when SQL/PGQ lands in Postgres)

Mostly reuses the Oracle backend: `GRAPH_TABLE` reads are standard SQL/PGQ (ISO/IEC 9075-16). Needs Postgres equivalents for the Oracle-specific parts: PL/SQL write blocks, Oracle Text, and the vector type (→ pgvector). Supersedes drivine4j's LATERAL + `json_agg` proposal for Node. Reverses the "Postgres is SQL-only" decision once it ships.

---

## Cross-cutting

- **NestJS coupling stays** — mirrors drivine4j, whose core depends on Spring directly.
- **Testcontainers helper** — equivalent of `@EnableDrivineTestConfig`: spins up the configured engine, with `USE_LOCAL_*` env override.
- **Docs** — wiki is canonical (`git@github.com:liberation-data/drivine.wiki.git`). Each tier ships a wiki update alongside the code. README stays a high-level pointer.
- **Backwards compatibility** — additive only at every step (after Tier 0). Existing `PersistenceManager` users untouched.
- **Sample app** — build in-repo first (`examples/`), then promote to `drivine-inspiration` as a quick-start template. Especially for the Tier 2 `@GraphView` example.

## Sequencing rationale

1. **Tier 0 + Tier 1 steps 1–3**: low risk; the backend/grammar seam is needed before any second Cypher engine.
2. **Tier 1 steps 4–8**: FalkorDB / Memgraph / Neptune-full fall out of the grammar abstraction.
3. **Tier 2 after Tier 1 stabilises**: generation depends on `GraphBackend`. Going straight to stateless avoids building (and then deprecating) the session model.
4. **Tier 3** once Tier 2 reads/writes are solid — search and schema reuse the view metadata.
5. **Tier 4**: pure UX layer.
6. **Tier 5 Oracle** after Tier 2 is stable (can run alongside Tiers 3–4); Postgres PGQ when Postgres supports it.

## Open questions

- **Whole JS numbers as Bolt integers?** The Neo4j driver sends every JS number as a float, so `LIMIT $n` and `list[$n]` fail on Neo4j and Memgraph, and `range(1, $n)` on Memgraph. Converting safe whole numbers to `neo4j.int` in the Neo4j spec compiler fixes it, but changes what is stored: a number written as `5` becomes an integer property instead of `5.0`. Reads are unchanged (the mapper already turns integers back into numbers), and Cypher compares int and float alike. Opt-in flag, or the default?

## Resolved

- **NestJS stays a dependency** (2026-10-18). drivine4j core depends on `spring-boot-starter`, `spring-tx` and `spring-boot-starter-aop` directly; the starter module is only auto-config. No core/nestjs package split for now.
- **Skip the stateful GraphObjectManager** (2026-10-18). Deprecated in drivine4j 0.1.0; build the stateless manager only.
- **RedisGraph dropped** (2026-10-18). EOL upstream, absent from drivine4j; FalkorDB covers the protocol.
- **Oracle is in** (2026-10-18), as Tier 5 via SQL/PGQ. Postgres follows via PGQ once available.
- **No `EMBABEL` engine type** (2026-10-18). JVM-only concern.
- **Dialect → `GraphBackend` + `CypherGrammar`** (2026-10-18), matching drivine4j's structure.
- Wiki is canonical. README stays as a pointer.
- Sample app: build in-repo first, promote to `drivine-inspiration` once stable.
- AgensGraph: removed (Tier 0).
- Connection-dir reorg: yes, Tier 1 step 2.
- `class-validator` integration: defer past Tier 2; opt-in `validateOnSave` only if real demand surfaces.

## Progress

Branch: `drivine4j-parity`. Local test DBs (docker): `drivine-falkordb` (`localhost:16379`, graph `drivine_test`), `drivine-neo4j` (neo4j:5, bolt `localhost:17687`, `neo4j`/`drivine-test`), `drivine-postgres` (postgres:16, `localhost:15432`, `postgres`/`drivine-test`, db `drivine`). Pass connection settings as env vars; they win over `.env`.

- [x] **Tier 0 — AgensGraph removed.** Postgres untangled onto plain `pg`: `PostgresConnectionProvider`, `PostgresConnection`, `PostgresCursor`, `PostgresResultMapper`, `PostgresSpecCompiler`. The compiler now rewrites every occurrence of a named parameter and never matches a name as the prefix of a longer one (the Agens compiler did both wrong). `ConnectionProperties.defaultGraphPath` removed. Integration test `PostgresRepository.spec.ts` covers named params, rollback and cursors.
- [x] **Tier 1 step 1 — `TransactionMode`.** `TransactionMode` enum, `ConnectionProperties.transactionMode` (env `DATABASE_TRANSACTION_MODE`, validated), builder `transactionMode()`, and `AutoCommitTransactions` for connections to auto-commit engines. The builder warns when it's set for an engine that has transactions. Nothing honours it until FalkorDB lands (step 4), which adds itself to `AUTO_COMMIT_ENGINES`. The batch half (`NonAtomicBatchException`) waits for `saveAll` in Tier 2.
- [x] **Tier 1 step 2 — connection-dir reorganisation.** `src/connection/{neo4j,postgres,neptune}/`, each with its connection, provider, cursor, result mapper and spec compiler, plus a barrel. The `cursor`/`mapper`/`query` barrels no longer list engine classes; `connection/index.ts` re-exports the engine barrels, so the root exports are unchanged (and now also include `Neo4jSpecCompiler`, `PostgresSpecCompiler`, `PostgresResultMapper`, `NeptuneConnectionProvider`).
- [x] Tier 1 step 3 — `GraphBackend` + `CypherGrammar`: **moved to the start of Tier 2.** `GraphBackend` produces object-manager statements, and there is no object manager to call it yet; the grammar's differences only matter for generated Cypher. Build it when generation starts, against real engines.
- [x] **Tier 1 step 4 — FalkorDB.** `src/connection/falkordb/` on the `falkordb` npm client (6.8). `DatabaseType.FALKORDB`; graph name from `databaseName`, default `graph` (as drivine4j); port 6379. Honours `TransactionMode` via `AutoCommitTransactions`. `FalkorDbParameterCoercer`: `Date` → nine-digit ISO text (same as drivine4j, so JVM- and Node-written stores compare alike), `Set` → list, `undefined` → null, and it **refuses map keys / parameter names that aren't plain identifiers** — the client writes params into the statement text with unquoted keys and FalkorDB accepts no quoted form, so such a key could inject Cypher. Positional `$1` → `$p1`. Result mapper returns nodes/relationships as properties and Temporal datetimes/dates as `Date` (UTC). Cursor pages with SKIP/LIMIT. Added `skipLibCheck` to tsconfig (`@redis/client` typings don't compile against our `@types/node`); no published `.d.ts` imports `falkordb`. Test container: `drivine-falkordb` (`localhost:16379`).
  - Follow-ups: `falkordb` is a hard dependency (pulls in the redis client) — consider an optional peer with a lazy `require`. FalkorDB can't store map properties (`@JsonPacked`, step 8). `NonAtomicBatchException` waits for `saveAll`. Native constraint commands wait for schema management (Tier 3).
- [x] **Tier 1 step 5 — Memgraph.** `DatabaseType.MEMGRAPH`, on `Neo4jConnectionProvider` with optional credentials (auth is off in a default Memgraph), as drivine4j does. Integration test covers read/write, rollback and cursors. Test container: `drivine-memgraph` (bolt `localhost:17688`).
  - Found: the Neo4j driver sends every JS number as a float, so `range(1, $n)`, `list[$n]` and `LIMIT $n` fail with a JS number on Memgraph, and the last two on Neo4j too. Pre-existing; see Open questions.
- [ ] Tier 1 step 6 — Neptune full (SigV4 + pool): **deferred** (2026-10-18, user call: low priority). Neptune-basic stays as is.
- [x] Tier 1 step 7 — contended-retry with jitter: **moved to Tier 2 (2.6).** In drivine4j it lives in `SaveExecutor.whenNotContended` and asks the backend whether a failure is contention; there are no saves to retry yet, and retrying inside a caller's transaction would be wrong.
- [x] Tier 1 step 8 — `@JsonPacked`: **moved to Tier 2 (2.11).** It's a mapping decorator; it needs the object mapping.
- **Tier 1 done** for everything that can be done before the object manager (Neptune-full deferred).

### Tier 2 steps

Legacy TS decorators (`experimentalDecorators` + `emitDecoratorMetadata`), as the repo and NestJS already use. Each step lands with unit tests plus integration tests on Neo4j, Memgraph and FalkorDB.

- [x] 2.1 Decorator metadata model — `src/annotation/` (decorators, metadata storage) and `src/model/` (`FragmentModel`, `RelationshipFragmentModel`, `GraphViewModel`, `RelationshipModel`, `ModelRegistry`). Models are built lazily on first use and cached, so self- and mutually-referencing views resolve; a view that fails its checks isn't cached. Labels are inherited (own first); decorated properties are inherited, a subclass's replacing its superclass's. TS-driven differences from drivine4j:
  - **Plain properties need no decorator.** Loads will project `n {.*}` and saves will take the instance's own enumerable properties; only special properties are decorated.
  - **Targets are thunks** (`target: () => Issue`): required for lists (`design:type` is just `Array`), optional for singles (falls back to `design:type`).
  - **`@TargetNode()`** marks the target of a `@RelationshipFragment` (Kotlin finds it by type).
  - **`required: true`** on `@GraphRelationship` (TS erases `?:`).
  - **`Related<T>`** type alias for a forward reference in the same module, as TypeORM's `Relation<T>`: decorator metadata otherwise reads the class before it's declared and throws.
  - A `@NodeFragment` must have at least one label (no class-name default: minifiers rename classes).
  - `ClassType<T>` in `query/QuerySpecification` gained a default (`T = any`) and is reused.
- [x] 2.2 `GraphBackend` + `CypherBackend` + `CypherGrammar` (Neo4j, Memgraph, FalkorDB): `loadAllFragments` / `loadFragment` / `countFragments`, in `src/backend/`. A fragment row is `{props: properties(n), labels: labels(n)}` (whole node, since TS can't list a class's fields; labels apart, so a property called `labels` can't collide) — verified on all three engines. Labels and property names are backtick-quoted when not plain. `CypherGrammar` holds only the engine name for now; differences get added as statements meet them.
  - Test support: `test/2.Integration/support/GraphEngines.ts` runs a suite on each configured graph engine (`describe.each(graphEngines())`). Env for the local containers: `source <scratchpad>/test-env.sh` (lists all five connections).
  - Fixed: `FalkorDbConnectionProvider.end()` closed the client twice when called concurrently (the client throws on a second close).
  - Note: `DatabaseRegistry.connectionProvider('default')` returns the *first registered* provider, not one named 'default'. Pre-existing; worth knowing.
- [x] 2.3 Hydration + read API + injection. `GraphObjectMapper.fragment()` maps `{props, labels}` to an instance via class-transformer's `plainToInstance` (as `transform()` does): renamed fields read from their graph name only, transient fields and `__drivine.`-prefixed properties skipped, field initializers kept where the node lacks the property. `StatelessGraphObjectManager`: `loadAll(type, where?, bindings?)`, `load(type, id)` (refuses two nodes with one id), `count(type, where?, bindings?)`, `database`. Filters are Cypher predicates over `n` with values in `bindings`, never interpolated. `GraphObjectManagerFactory` (one manager per database, over the delegating persistence manager, so it joins `@Transactional`), `@InjectGraphObjectManager(database?)`; providers only for graph databases.
- [x] 2.4 Views: `loadAll` / `load` / `count` of a `@GraphView`, one statement each. Row shape `{root: {props, labels}, rels: {field: …}}`; relationship fragment `{rel, target}`; single = first item or null; required relationships filter roots (and nested-view targets). `maxDepth` cut already in (a relationship is followed maxDepth times along any one path, then `[]` / null), so self-referencing views terminate; the query-time depth override stays in 2.9. `GraphObjectMapper.view()` hydrates root, relationship fragments, nested views.
  - **Two projections, chosen by `CypherGrammar.viewProjection`:** INLINE pattern comprehensions (Neo4j, Memgraph) and CALL_SUBQUERY (FalkorDB: each relationship in its own `CALL { WITH x OPTIONAL MATCH … RETURN collect(CASE WHEN t IS NOT NULL THEN … END) }`, nested for nested views). Inline isn't used everywhere because Neo4j's newer Cypher retires `CALL { WITH … }` imports.
  - **FalkorDB 6.0 bug found (silent wrong results):** in one projection, a pattern comprehension that names its relationship (`[(n)-[r:R]->(m) | properties(r)]`) makes every *later* comprehension return `[]`. Also: a `WHERE` with a comprehension followed by a `RETURN` with comprehensions errors ("expected Node or Null but was List") unless a `WITH` sits between. Nested comprehensions themselves work on 6.0 (FalkorDB#1888 looks fixed). **Reported:** FalkorDB/FalkorDB#3386 (silent empty) and #3387 (type mismatch), both still reproduce on `edge-rs`; related to the closed #2002. When fixed, FalkorDB could move to INLINE.
  - Existence: `EXISTS { MATCH … }` (Neo4j, Memgraph), `size([… | 1]) > 0` (FalkorDB, which has neither `EXISTS {}` nor pattern `exists()`).
- [x] 2.5 `delete(type, id, {where?, bindings?, cascade?})` and `deleteAll(type, where?, bindings?)`, both returning roots deleted; `DETACH DELETE`, so related nodes stay. A view's root is only deleted if it meets the view's requirements (as a load would find it). Filters over views use `n` (drivine4j uses the root field's name). `CascadeType` NONE / DELETE_ALL / DELETE_ORPHAN for views by id: `CascadeTargets` lists the reachable nodes as flat paths from the root joined with `+` (no nested comprehensions — FalkorDB mis-evaluates them, #2006), honouring maxDepth and nested requirements; then `FOREACH (t IN … | DETACH DELETE t)`. DELETE_ORPHAN refused on Memgraph (`orphanDeleteLimit`: no existence check outside WHERE), as in drivine4j. A `WITH n` precedes the list for FalkorDB#3387.
- [x] 2.6 `save(object, {replace?, removedTargets?})`, one statement (`SaveStatementBuilder`): root `MERGE`d on its id, `SET n += $props` (non-null fields only — null leaves the stored value; NullPolicy comes in 2.8); each relationship field a `FOREACH` over a rows parameter (text doesn't grow with the list; no empty-`UNWIND` row loss), nested views nested `FOREACH`es cut at maxDepth; undirected satisfied by either direction. `replace` (TS-idiomatic field names instead of `Replace(View::field)`) trims a field's relationships of its type/direction to targets with its labels, keeping ids other same-type fields hold; null single = remove, null list refused. `RemovedTargets.DELETE_UNREFERENCED` deletes removed targets unreferenced the way the field referred (outgoing: nothing points at it; incoming: it points at nothing; undirected: no relationship), never the root or a node the object holds. Every saved node needs a `@NodeId`. Contended retry with jitter (`whenNotContended`, 6 attempts, (attempt+1)·15ms + random up to as much again), only outside a caller's transaction; contention = `neo4j.isRetriableError` over Bolt, never on FalkorDB. Verified identical on all three engines. `Replace.all()` waits for `@NodeStamp` (2.7).
  - **Another FalkorDB bug, reported: FalkorDB/FalkorDB#3388** — a `MERGE` binding a variable to a relationship created earlier in the same clause gives "Variable not found" (still on edge-rs). Hit by a nested view leading back along its parent's relationship. Workaround on all engines: relationship-fragment properties are set in a second pass after `WITH n`.
- [x] 2.7a `@NodeStamp` + `StaleObjectException`. drivine4j's format (two 64-bit tokens, `data:links`, under `__drivine.stamp`), so JVM- and Node-written stores check alike. Every saved node is stamped; the data token is replaced only when the node's properties change (detected with `any(k IN keys($props) WHERE n[k] IS NULL OR n[k] <> $props[k])` — dynamic access works on all three engines); the links token of both ends when a relationship is made (`ON CREATE SET` on the edge `MERGE`), removed, or has its properties changed. A root whose object carries a stamp is checked in the same statement: `MATCH` + `SET n.__drivine.lock` + compare + `REMOVE` + filter, so of concurrent writers holding one stamp exactly one wins (verified with 5 concurrent writers on each engine); `replace` compares the links token too. A refused save writes nothing; `StaleObjectException` says found stamp / deleted. The stamp handed back follows drivine4j's rules (`Stamps.handedBack`): only tokens that were as the object said; an object with no stamp gets the whole stamp of a node it made, the data token alone of one it found. Exhausted contention on a checked save → `StaleObjectException` with cause.
  - Fixed: contention detection used `neo4j.isRetriableError`, which isn't in the installed driver (5.14) at runtime — every real conflict threw a `TypeError` instead of being retried. Now `Neo4jError.isRetriable`. The 5-writer test is the first to exercise it.
  - Fixed: `FalkorDbRepository.spec` cleared the whole shared graph, racing other suites run in parallel; now scoped to its own label.
- [x] 2.7b Related nodes of stamped classes are handed the stamp the save left: the statement reads their `{id, stamp}` right after the root check and again at the end (no values come out of a FOREACH), and `Stamps.handedBack` applies per instance (absent before = made by the save). `replace: 'all'` covers every relationship field of the view, refused for an object whose root carries no stamp. An unchecked root write takes the lock too (related nodes don't yet).
- [x] 2.8 split into:
  - [x] 2.8a `NullPolicy` (IGNORE default, CLEAR clears null/undefined own-key fields of the object or a view's root, via `+= {k: null}` — verified on all three; related nodes always IGNORE) and `only` / `except` on `save` (field names of the object / view root; both together refused; id or stamp in `only` refused). Change detection fixed so clearing an absent property isn't a data change. TS limit: a declared-but-never-assigned field isn't an own key, so CLEAR can't see it.
  - [x] 2.8b `update(type, id, change, attempts = 3)`: load, deep snapshot (`ObjectUtils.deepCopy`, keeps prototypes), apply change (mutate or return copy), write root fields that differ (`only`) with nulls cleared, and `replace` for relationship lists that lost a node (compared by node id; lists that only grew add). Checked against the loaded stamp; stale → reload and re-apply; deleted meanwhile → undefined; id or class change refused. Related nodes are written whole (drivine4j writes only their changed fields — not yet). `create(object)`: one statement, `MERGE … ON CREATE SET made` then `WITH n WHERE made`, so a node that's there (or that a racing writer makes) stops it before any write → undefined; an object carrying a stamp is refused. Returned as `T | undefined` rather than null.
  - [x] 2.8c `patch(type, id, {set, clear, where, bindings})` → `{found, applied, changed}` (all four outcomes verified on each engine); the node is locked, then found again with the condition in a `WHERE` (Memgraph takes existence checks nowhere else), so a condition may name relationships. Changed → new data token; same values → stamp kept; never stamped → given one. `patchAll(objects, {only | except, nullPolicy})` → one result per object in order; `UNWIND` rows sorted by id (consistent lock order), 1,000 per statement; makes no node. Both refuse the id, stamp, transient fields, a field named twice. Retried on contention outside a transaction. Without the DSL (Tier 4), conditions are Cypher strings over `n`; multi-chunk `patchAll` isn't atomic outside a transaction.
  - [x] 2.8d `saveAll(objects, options)`: fragments of any classes in one statement per 1,000 rows (`FragmentBatchStatement`, a `FOREACH` per class, stamps read before/after for hand-back; not checked — a batch only adds; a stale fragment keeps its old token); each view its own statement, checked as `save`. Outside a caller's transaction, a multi-statement batch runs in a connection-level transaction (provider `connect()` → start → statements → commit / rollback), retried whole on contention; a stale view (no row) aborts and rolls back (verified on Neo4j and Memgraph). FalkorDB: >1 statement runs statement by statement with one warning (WARN) or is refused up front with `NonAtomicBatchException` (STRICT); a single statement is always atomic. `replace` with fragments refused; `only` / `except` / `nullPolicy` apply. Not yet: `bySameBatch` on StaleObjectException.
  - [x] 2.8e `gom.edges`: `relate(from, to, type, props?, mode = MERGE)` → whether both nodes were found and joined (MERGE counts the existing relationships and how many carry the props under both nodes' locks, and marks both ends' links tokens only when something changed; CREATE makes another each call; null props left out); `unrelate(from, to, type)` / `unrelateAll(from, type, direction)` → count removed, both ends marked. `nodeRef(Type, id, ...labels)`. Nodes are matched by id and the fragment's labels plus any extra, never created. Retried on contention. Not yet: drivine4j's `relatedMatch`.
- **Tier 2 through 2.8 done.** Next: 2.9 recursive views/paths/aggregates.
- [x] 2.9 split into:
  - [x] 2.9a `@ReadOnly` (explicit, or implicit for a fragment list with maxDepth > 1): never written by a save, refused in `replace`, left out of `replace: 'all'`. **Multi-hop fragment lists** (missed in 2.4): read over `*1..maxDepth`, each node once — inline via `reduce` de-dup in the comprehension, CALL form via `collect(DISTINCT …)`; verified on all three; cascades follow them the same way. Relationship fragments refuse maxDepth > 1. **Depth override** per load: `loadAll(type, {where, bindings, depth: {field: n}})` / `load(type, id, {depth})`, by field name as drivine4j's `depth("field", n)`.
  - [x] 2.9b `@Count(type, direction?)` and `@Aggregate({function, type, property?, direction?})` (options object where drivine4j has positional annotation args): single hop, any target node. Inline engines: `size(...)` / `reduce` over a comprehension (AVG = sum ÷ size, null when empty); FalkorDB: `CALL { … OPTIONAL MATCH … RETURN count/sum/avg/min/max }`. SUM/COUNT of none = 0, AVG/MIN/MAX of none = undefined, on all three. Read-only by nature (not relationship fields, so never saved).
  - [x] 2.9c `@GraphPath([hop(type, direction?, label?), …], {target, required?})` (`hop()` helper for Kotlin's `Hop(...)`): far node mapped, each once (inline `reduce` de-dup / CALL `collect(DISTINCT …)`), hop labels constrain intermediate nodes, list / single / required (filters roots). FalkorDB tests the far node's labels after the match (drivine4j's FalkorDB#3332 workaround). Ends at a node fragment only. Read-only.
- **2.9 done.** Next: 2.10 polymorphism.
- [x] 2.10 Polymorphism. Subclasses of a `@NodeFragment` are recorded as they're decorated (known once their module is loaded); `registry.registerSubtype(Parent, Sub)` for a class outside the chain (drivine4j's interface case). Loading maps a node to the most specific known subtype whose labels it carries — roots, related nodes, relationship-fragment targets, paths. Saving: a view's root uses its concrete class's labels; a related node of a subclass gets its own labels via a guarded `FOREACH … SET t:Label` per subtype (MERGE takes no parameterised labels; verified on all three). `instanceOf(Type, alias = 'n')` → label predicate for filters. `ClassRef<T>` (abstract-friendly) on the manager's API and in target thunks, so abstract parents need no casts.
- [x] 2.11 split into:
  - [x] 2.11a `@JsonPacked` (JSON text on every write path: save, saveAll, patch, patchAll, relationship-fragment props; parsed on load, non-JSON text left as is), `@Default` (null keeps the initializer; absent already did), `@EmptyWhenAbsent` (`[]` or `{}` by `design:type`), `@SortedBy(path, ascending?)` on list relationships (dot paths, nulls last). Shared `FieldMapping` on node and relationship fragment models.
  - [x] 2.11b `@PropertyBag({prefix?, delimiter?, flat?})`: one property per entry (`metadata.source`), reassembled on load; overlapping namespaces and a second flat bag refused; values must be storable (scalars/dates or arrays of them). Entries are written as explicit `SET n.`k` = $p` clauses (FalkorDB param maps can't hold dotted keys), counted in the data-token change check; a related node with a bag gets a `MATCH … SET` part after the FOREACHes; a bagged fragment in `saveAll` is a statement of its own; patch/patchAll refuse bag fields. CLEAR reads the root's keys first and removes entries the bag no longer has (prefixed bags). Flat bag: takes every property not taken by another bag or a known field (decorated, or initialized by the class — TS can't list undecorated, uninitialized fields).
  - [x] 2.11c `@NodeLabels(members?)` on a string array or Set: closed (an enum or names; reads/owns only members; members may not be the fragment's own labels) or open (reads every label but the fragment's own; owns what it recorded writing in `__drivine.labels.<field>`). Labels written as per-object `SET n:`L`` (related nodes via the per-node part, add only); CLEAR removes owned labels no longer held (open: reads the record first). Counted in the data-token change check. Labelled fragments in `saveAll` are statements of their own; patch refuses the field. `edges.loadRelated(from, type, direction, Target)` returns each related node once (relate/unrelate came in 2.8e).
- **Tier 2 done** (except 2.12 `groups`).
- [x] 2.12 `gom.groups.load(Source, {where, bindings, keys, aggregates, having, orderBy, limit, skip})` → typed rows keyed by the names given (a spec object where drivine4j has a DSL block; Tier 4 can add the typed DSL). Keys: `key(prop)` or `pathKey(Target, [hop…])` (hydrated as the node, ordered by its id). Aggregates: `count(filter?)`, `sum/avg/min/max(prop, filter?)`; sum over none 0, others undefined. `having` compares aggregates; order ties broken by keys ascending. `WITH DISTINCT n, k…` so a node is once in each group. `gom.groups.countBy(Source, prop)` → Map. Verified on all three engines with drivine4j's own feedback example.
- **Tier 2 complete.**

### Tier 3 steps

- [x] 3.1 `gom.indexes` / `gom.constraints` (`src/schema/`): `ensure`, `list`, `drop` for `rangeIndex(label, props)` (single / composite) and `uniquenessConstraint(label, props)`. Per-engine `SchemaGrammar` (DDL + introspection: Neo4j `SHOW INDEXES/CONSTRAINTS` wrapped in a map RETURN; Memgraph `SHOW INDEX/CONSTRAINT INFO` read by column position, since it takes no RETURN; FalkorDB `db.indexes()/db.constraints()`). Run on a connection of their own in auto-commit (`SchemaExecutor`). Duplicate check before a constraint → `VIOLATION` with a sample, nothing made. FalkorDB: per-property ranges (composite = each property's); uniqueness via `graph.constraintCreate` (Redis) over a range index ensured first, polled until built. Constraint properties compared as sets (Memgraph reorders them). Items named as drivine4j names them by default, `<label>_<props>_<range|unique|vector|fulltext>`, where the engine names items, so a store shared with drivine4j holds one item, not two (changed in 3.5 from an earlier `drivine_…` scheme). **Found:** FalkorDB *does* turn writes away under load ("ERR another write is in progress, retry the query", seen from `GRAPH.CONSTRAINT CREATE` while other suites wrote) — so `FALKORDB_GRAMMAR.contended` now recognises it (saves etc. retry), and `SchemaExecutor` retries too. Not on PersistenceManager (drivine4j puts them there) — on the object manager, which knows the engine.
- [x] 3.2 `vectorIndex(label, prop, dims, similarity)` and `fullTextIndex(label, props)` through `indexes.ensure` / `recreate` / `drop` / `list(kind)`. Neo4j: named `CREATE VECTOR INDEX … OPTIONS {indexConfig}` / `CREATE FULLTEXT INDEX … ON EACH […]`; Memgraph: `CREATE VECTOR INDEX … WITH CONFIG {dimension, capacity, metric: cos|l2sq}` / `CREATE TEXT INDEX name ON :L(props)` (no experimental flag needed now), read from `SHOW VECTOR INDEX INFO` / `SHOW INDEX INFO` by position; FalkorDB: unnamed, `OPTIONS {dimension, similarityFunction}`, one full-text index per label over its properties. DRIFT (dims, similarity, full-text properties) reported, nothing changed; `recreate` drops and makes. **For 3.4:** vector scores differ — Neo4j a normalised similarity, Memgraph similarity + distance, FalkorDB a *distance* (lower is nearer).
- [x] 3.3 `@RangeIndex()`, `@Unique()`, `@FullTextIndex()` (field, or class with `{properties}`), `@VectorIndex({similarity?, dimensions?})`; `SchemaCatalog.of(...)` / `fromFragments(dimensionProvider, ...classes)` (first label, graph names) with `withVersion`, `named`, `forDatabase(s)` / `forDefaultDatabase`; `SchemaManager(factory, {catalogs, mode: FAIL_FAST|WARN, recreateOnDrift, enabled})` with `enforce()` / `recreateAll()`: catalogs merged per database (identical once, conflicts refused), indexes before constraints, version token on a `_DrivineSchema {catalog}` marker (first adopted, change → recreate once). `DrivineModule.withOptions({connectionProviders, schema})` enforces at startup (async provider) and injects `SchemaManager`. Broadcast default = every graph database; a named non-graph target fails.
- [x] 3.4 `loadNearest(type, vector, {topK, searchK?, threshold?, where?, bindings?, property?, partitionLabel?, depth?})` → `Scored<T>[]` (`{value, score}`), fragment or view. Score normalised to Neo4j's scale on every engine — cosine (1+cos)/2, euclidean 1/(1+d²): Memgraph cosine `similarity` → (1+s)/2, FalkorDB cosine distance → 1−d/2, FalkorDB euclidean `d` → 1/(1+d²); verified numerically on all three. Index found by Drivine's name (drivine4j's default, `<label>_<prop>_vector`) on Neo4j/Memgraph, by label+property on FalkorDB; `partitionLabel` swaps the label. Filters (labels, threshold, where, view requirements) in a `MATCH (n) WHERE …` after the search (Memgraph refuses EXISTS in a WITH's WHERE); `searchK` → LIMIT topK after the filter; k and limit written as literals (a JS number goes over Bolt as a float). **FalkorDB vectors written as `vecf32(…)`** on every write path (save root/related, saveAll, patch, patchAll), via `CypherGrammar.vectorValue`; vecf32 comparison keeps stamps stable. Not yet: Neo4j exact re-rank over a quantized beam; CLEAR of a null vector in batch/patchAll.
  - **Memgraph bug found (not yet reported — ask the user):** `vector_search.search` returns nodes deleted since the last GC, and any read of one fails ('Trying to access labels on a deleted node') until GC runs (`FREE MEMORY` forces it). Minimal repro: create index, create 2 nodes, delete one, search → error. No existing issue found.
- [x] 3.5 `loadMatching(type, text, {topK, threshold?, where?, bindings?, property?, depth?})` → `Scored<T>[]`, fragment or view. Index from the fragment's `@FullTextIndex` (field or class-level; `property` picks among several). Scores scaled by the batch's best (best = 1; best 0 → 1, FalkorDB's NaN guard), as drivine4j; `topK` a trailing LIMIT; filters in the shared `MATCH (n) WHERE` tail with `loadNearest`. Query text passed through to the engine's language (Lucene on Neo4j). Neo4j `db.index.fulltext.queryNodes(name)`, Memgraph `text_search.search_all(name)`, FalkorDB `db.idx.fulltext.queryNodes(label)`. Full-text indexes are found by name where the engine names them (several to a label), else by the same property set, in any order; FalkorDB one to a label, so other properties there are DRIFT.
  - **Schema item names aligned with drivine4j's defaults** (`<label>_<props>_<range|unique|vector|fulltext>`), backtick-quoted in DDL, so a store shared with drivine4j holds one item, not two.
  - **Second Memgraph bug found (not yet reported — ask the user):** a text index over several properties (`CREATE TEXT INDEX i ON :L(a, b)`) indexes only the first — `b` is never matched though SHOW INDEX INFO lists both and counts the node. Workaround: on Memgraph a multi-property full-text index is made label-wide (`ON :L`), which indexes every property (a search can then match the label's other text too); drift treats a label-wide index as covering; drops use the engine's index name.
  - Test infra: suites that run schema DDL run in band after the rest (`gate.sh`), since parallel DDL on one Neo4j queues on the schema lock until hooks time out.
- [x] 3.6 `gom.storeIdentity()` → `{id, engine, assignedAt}`, cached per manager, from `(:DrivineStore {key: 'singleton', storeId, assignedAt, engine})` — drivine4j's node and keys, so JVM and Node agree on one identity. Uniqueness constraint `DrivineStore(key)` ensured first; a lost MERGE race (constraint error, or FalkorDB's write-in-progress) backs off 50·2ⁿ ms and merges onto the winner; existing duplicates → oldest wins, logged. Verified: 5 concurrent first resolves agree on all three engines.
- **Tier 3 complete.** Next: Tier 4 (type-safe DSL), Tier 5 (Oracle).

### Tier 4 steps

- [x] 4.1 Typed query references (`src/dsl/`: `Refs<T>` mapped types, `QueryRefs` Proxy over `ModelScope`, `QueryRenderer`) on `loadAll`, `count`, `deleteAll` (`Filter<T> = string | LoadOptions | QueryFn<T>`; count/delete refuse order/skip/limit). Conditions on root properties (graph names, JSON-packed values packed, property-bag entries `q.metadata.source`, `@NodeLabels` `hasItem` → label test), across relationships (flat = some related node meets it; `any` = one node meets all; `none`), relationship-fragment properties (read from the relationship) and targets, nested views' relationships, multi-hop fragment lists (`*1..d`, depth overrides), `instanceOf` on the root and related nodes. Values always bound (`$_q0…`). Order by root properties with null placement as its own key (`x IS NULL [DESC]`, verified on all three); `skip`/`limit` as literals after the order; for a view, roots are paged with their relationships whole. Verified on all three engines (63 tests) plus renderer unit tests with `@ts-expect-error` type checks.
  - **New FalkorDB bug, reported: FalkorDB/FalkorDB#3392** — two pattern comprehensions over one pattern, each with a WHERE, joined by AND match no rows (6.0.0 and edge-rs). FalkorDB's form is now `any(x IN [pattern | x] WHERE …)`, with a relationship fragment's properties carried as `properties(r)` in a map (#3386); new `CypherGrammar.someMatch`.
- [x] 4.2 `where` on `loadNearest` / `loadMatching`, `delete(type, id, {where})` and `patch` takes `string | WhereFn<T>` (`(q) => Where`; options generic, default `any`); a patch condition over a view may test its relationships (`q.session.id.eq('s1')`), read under the node's lock. Runtime-key escape hatches as drivine4j 0.0.69: `property(storedName)` (any node: root, related, or a relationship fragment's relationship; quoted, bound) and `predicate(storedName, operator, value?)` for an operator known at run time; `hasAnyLabel(...labels)` → `any(_l IN labels(x) WHERE _l IN $p)`. These names (and `instanceOf`, `any`, `none`) shadow same-named fields in the types; such a field is reached through `property`. Verified on all three engines.
- [x] 4.3 Keyset `seek`: `q.prop.after(value)` cursor components, one per `orderBy` term (same properties, same order); lexicographic predicate from the directions, `a <= A AND (a < A OR (a = A AND b < B))`, `IS NOT NULL` per key only on Neo4j (`CypherGrammar.keysetNullGuard`, as drivine4j's `indexesExcludeNulls`), no parentheses around the whole (FalkorDB#3331). Refused: no order, count mismatch, path mismatch, with `skip`, with null placement, on count/delete. Verified paging through ties both directions, fragments and views, all three engines. **Index advice** (`QueryIndexAdvisor`, `gom.indexAdvice = 'OFF' | 'WARN' (default) | 'FAIL'`, `gom.indexAdvisor.refresh()`): an ordered query wants a range index over exactly its ordered properties in order (FalkorDB: each property indexed); none → warn once per label/properties or throw, naming the `rangeIndex(...)` to ensure; skipped when a top-level equality pins the @NodeId or a uniqueness constraint's properties; schema read once per manager, failures to read ignored. **Fixed:** `indexes.ensure` of a composite range on FalkorDB failed when one property was already indexed ("Attribute is already indexed"); now only the missing properties are indexed.
- [x] 4.4 Order by an expression over the root (drivine4j 0.1.7 `OrderExpressions`; functions, since TS has no operator overloading): `plus, minus, times, div` (reals: `toFloat(a) / b`), `negate, exp, floor, coalesce, param`, `epochSeconds(date)` folded caller-side and bound, `caseOf([cond.then(v)…], otherwise)` with `above, below, atLeast, atMost, equalTo, notEqualTo, hasValue, hasNoValue` and `.and / .or / .not`. Operands: numeric root property refs (refs carry their path under a symbol), expressions, values (always bound). `asc()/desc()` + null placement; ties to the next term; refused under `seek`; no index advice for an expression order. Verified identical on all three engines. **Ordering of nested collections** by a term through a list relationship (`q.assignees.since.desc()`, `q.assignees.person.name.asc()`, nested lists through single relationships): applied to each object's list as it's mapped, terms of one list in turn, Cypher's null placement unless placed; overrides `@SortedBy`. Done client-side, not in the database as drivine4j does (APOC `sortMaps` on Neo4j only; no list sort on Memgraph/FalkorDB) — same result, the list is loaded whole either way. A term through only single relationships is refused.
- [x] 4.5 Typed `groups`: `gom.groups.load(Source, (q) => GroupQuery)` — `key(q.page)` (key value typed as the property: `string | undefined`), `sum/avg/min/max(q.score, filter?)`, `count(filter?)`, filters and `where` as conditions over the references (`Where`), rendered with one renderer so all values are bound without clashes; string forms unchanged. References become stored names (`@GraphProperty` honoured). Verified on all three engines.
- **Tier 4 complete.** Next: Tier 5 (Oracle SQL/PGQ).

### Tier 5 steps (Oracle, after drivine4j's `oracle-sql-pgq-plan.md`)

Storage as drivine4j (Decision 1): one node table and one edge table per graph, labels and properties as JSON, a property graph over them; reads are `GRAPH_TABLE`, writes one PL/SQL block interpreting a JSON save plan, with `FOR UPDATE`. Tests run against a `drivine-oracle` container (`gvenzl/oracle-free:23-faststart`, port 11521, service FREEPDB1, user `drivine`), suites skipped unless `ORACLE_DATABASE_TYPE=ORACLE`.

- [x] 5.1 SQL connection substrate: `DatabaseType.ORACLE`, `OracleConnectionProvider` (node-oracledb 7 thin mode, own pool, `host:port/service` from DATABASE_NAME), `OracleConnection` (auto-commit outside a transaction, commit/rollback inside; a PL/SQL block's first `DBMS_SQL.RETURN_RESULT` set is its rows; CLOBs as text; JSON columns as objects), `OracleSpecCompiler` (`$name` → `:name`, only binds the statement names, lists/maps bound as JSON text, skip/limit as `OFFSET … FETCH`), `OracleCursor`. Builder and env wiring. Verified against Oracle Free 23.26.3.
- [x] 5.2 Backend seam: `GraphBackend` no longer exposes a `CypherGrammar`; the manager hands it the query AST (`renderQuery(QueryFn)`, `renderWhere(WhereFn)`) and asks it for every statement: `patchOne/patchMany`, `fragmentBatch`, `groups` (typed group queries resolved inside the backend), `related/relate/unrelate/unrelateAll`, `storeStamps/assignStoreStamp`, `schemaVersion/recordSchemaVersion` (contention was already the backend's). `EdgeOperations`, `GroupOperations`, `StoreIdentityResolver` and `SchemaManager` hold no Cypher. A string `where` means the store's own language. Schema DDL stays with `SchemaGrammar`, chosen by database type. No behaviour change: the whole suite, unchanged, on all three engines.
- [x] 5.3 `OracleGraph` (drivine4j's layout and names: `<graph>_node (nid, labels JSON, props JSON, stamp)`, `<graph>_edge (eid, src, dst, type, props)` cascading on node delete, `<graph>_schema`, src/dst and multivalue-labels indexes, property graph `<graph>`), made on a provider's first connection by one idempotent PL/SQL block (default graph `drivine`). `OracleBackend` (chosen by `backendFor(type)`, used by `GraphObjectManagerFactory`): fragment `load`, `loadAll` (skip/limit as OFFSET/FETCH), `count`, `delete` (id + condition), `deleteAll`, `heldProperties`, `foundStamp`; rows are the graph engines' `{props, labels}` built by `JSON_OBJECT … RETURNING JSON` with the stamp column folded in as `__drivine.stamp`; labels tested with `JSON_EXISTS(labels, '$?(@ == "L")')`; ids compared JSON-typed (`JSON_EXISTS(props, '$?(@."id" == $v)' PASSING …)`), so a number is never taken for text; a raw `where` is SQL over the row `n`. ORA-00060/08177 are contention. Everything else refuses with "… is not available on Oracle yet". The Oracle result mapper now gives a one-column row as its value, as the graph engines do. Polymorphic loads verified.
- [x] 5.4 View reads on Oracle (`OracleViews`): one `{root, rels}` JSON document per root, as the graph engines return, each relationship a correlated subquery over the edge table aggregated with `JSON_ARRAYAGG` (single: `FETCH FIRST 1 ROW ONLY`): outgoing / incoming / undirected, relationship fragments (`{rel: e.props, target}`), nested views with their requirements, recursion to maxDepth (past it: null → `[]` / undefined), deep fragment lists as `CONNECT BY NOCYCLE … LEVEL <= d` over the type's edges (each node once; depth overrides), `@GraphPath` as a join chain with hop labels (far nodes once), `@Count` (relationships) and `@Aggregate` (`JSON_VALUE … RETURNING NUMBER`; SUM of none 0, AVG/MIN/MAX of none undefined). Required relationships and paths as `EXISTS` on load, loadAll, count, delete and deleteAll of a view. Plain SQL over the two tables rather than `GRAPH_TABLE` (drivine4j found nested `GRAPH_TABLE` can't correlate, ORA-40996). Polymorphic related nodes verified.
- [x] 5.5 The query DSL on Oracle (`OracleQueryRenderer`, from the same backend-neutral references and `ModelScope`): comparisons as JSON path filters against bound values (`JSON_EXISTS(props, '$?(@."k" > $v)' PASSING …)`), so numbers/text/booleans compare by JSON type and a missing property meets none, as in Cypher; `in`/`notIn` as `||` of equalities; text tests via `JSON_VALUE` (`INSTR`, `SUBSTR`, `REGEXP_LIKE`, `LOWER`); `hasItem` as `[*]?(@ == $v)`; labels, `instanceOf`, `hasAnyLabel`, `@NodeLabels`; relationships (flat, `any`, `none`, relationship-fragment properties from `e.props`, nested views, deep lists) as EXISTS over the edge table; order by `JSON_QUERY(… RETURNING JSON)` (orders by JSON type: 9 < 10 < 100) with Oracle's own `NULLS FIRST/LAST`; expressions over `JSON_VALUE … RETURNING NUMBER` (text where compared with text); keyset `seek` as JSON path filters; collection sorts as on the graph engines. Dates compare as ISO 8601 text, as saves will write them. **The whole query suite now runs on Oracle too** (stores: each graph engine + Oracle, one seed each): 31/31. Fixed: Oracle bind names may not begin with `_`, so the compiler binds `:b0, :b1, …`; the index advisor gives no advice where an engine has no schema grammar yet. Also fixed a pre-existing race: the read suite's and MemgraphRepository's heroes shared a name.
- [x] 5.6 Saves on Oracle (`OracleSaveBuilder`): one PL/SQL block per save, every value bound, its declarations fixed and its body a call per node and relationship: `find_node` (labels + id, JSON-typed, more than one refused), `make_node`, `apply_node` (properties merged with `JSON_MERGEPATCH`, so a null removes a key as CLEAR does; labels added/removed; an open `@NodeLabels` field's record unioned or replaced; change detected with `JSON_EQUAL`), `write_node`, `restamp` / `relink` (drivine4j's tokens, as `CypherStamps`), `link` (MERGE semantics; undirected satisfied either way; relationship-fragment properties merged, ends relinked on change), `trim_edges` (replace, then DELETE_UNREFERENCED by direction, never the root or a held node). The root is locked (`FOR UPDATE`) before its stamp is compared; a checked save (data token, plus links when replacing) or a create that finds it there returns no row and writes nothing. Stamped related nodes read before/after for hand-back. NullPolicy, only/except, bags, subtype labels, `create`. Oracle has no empty string, so a made root comes back with `found` null; the manager reads that as ''. Verified: 5 concurrent writers with one stamp → exactly one wins. Not yet: cascading deletes (5.7).
- [x] 5.7 On Oracle (`OracleWrites`, PL/SQL blocks over the save block's procedures, so stamps are kept alike): `saveAll` (fragments of several classes per block, stamps read before/after for hand-back; multi-statement batches in a connection transaction as on Neo4j), `patch` (`{found, applied, changed}`; the condition read under the node's lock, typed or SQL), `patchAll` (rows read whole first, then written in id order), `update` (load + save, already worked), `edges.relate` (MERGE: both ends locked in key order, existing relationships counted and merged, ends marked only when something changed; CREATE), `unrelate`, `unrelateAll`, `loadRelated`, and cascading deletes (`DELETE_ALL` / `DELETE_ORPHAN` over what loading the view reaches, maxDepth and nested requirements applied, in one block). **node-oracledb 7.0.1 bug found (not reported — ask the user):** a PL/SQL block's returned result set loses its last row when a column is JSON-typed (thin mode, Oracle 23.26; even fetched as a string; plain SELECTs fine). Workaround: blocks return JSON as text in a column named `<name>:json`, parsed by `OracleConnection`.
- [x] 5.8 On Oracle: `OracleSchemaGrammar` (chosen by `schemaGrammarFor(ORACLE)` over the default graph): range indexes and uniqueness constraints as function-based (unique) indexes over `CASE WHEN <label> THEN JSON_VALUE(props, '$.p' …) END` per property, so only the label's nodes are indexed, as drivine4j does; each recorded in `<graph>_schema` with its object's name (hashed, `<graph>_r_…`/`_u_…`); listing reads the catalog where the object still exists; drop drops the recorded object. The duplicate check before a constraint moved behind `SchemaGrammar.conflicts` (Cypher shared by the three engines; Oracle: GROUP BY … HAVING COUNT(*) > 1, a single property's value as it is). Store identity as a `DrivineStore` node row (key/storeId/assignedAt/engine; a racing mint turned away by the key's unique index, ORA-00001, and retried); schema marker as `_DrivineSchema` rows. Index advice now works on Oracle. Verified: 5 concurrent first resolves agree; a duplicate save after the constraint fails with ORA-00001. Vector and full-text indexes refuse until 5.9.
- [x] 5.9 Search on Oracle (`OracleSearch`), the same `{value, score}` rows and pipeline as the graph engines (candidates, then threshold / where / view requirements, then topK): `loadNearest` exact — every node of the label (or partition label) with the property ranked by `VECTOR_DISTANCE(TO_VECTOR(…), TO_VECTOR($_vector), COSINE | EUCLIDEAN_SQUARED)`, `searchK` candidates, scores on Neo4j's scale ((2 − d)/2, 1/(1 + d²)); `loadMatching` counts whole-word, case-blind occurrences of the query's words in the indexed properties, scaled by the best hit (words, not Lucene's language; not BM25). Vector and full-text indexes are recorded in the catalog (dimensions, similarity) so `ensure` / drift / `drop` / `SchemaManager` work, but no index object is made: drivine4j's side tables with a vector index (needs vector memory) and Oracle Text are the next refinement. **The nearest and matching suites now run on Oracle too** (`allStores()`, `clearLabels`), 10/10. `SchemaManager` counts Oracle as a graph store. Fixed: `raw` is reserved in Oracle.
- [x] 5.10 Grouped reads on Oracle (`OracleGroups`): each node once with its keys (a property as its JSON text, so values group and come back typed; a path key's far node through the hops' joins), then COUNT / SUM (0 over none) / AVG / MIN / MAX with filters as `CASE WHEN`, `having`, order by key or aggregate with ties broken by the keys (a path key by its id), OFFSET/FETCH; typed group queries resolved by the Oracle renderer (`GroupStatement.resolved` now takes any `ConditionWriter`). **The groups suite runs on Oracle too** (its own seed, SQL for its raw filters): 6/6.
- **Tier 5 (Oracle) complete**: every manager operation runs on Oracle; the query, nearest, matching and groups suites run there beside the graph engines, with Oracle suites of their own for connection, fragments, views, saves, writes and schema. Postgres waits for SQL/PGQ in Postgres. Deferred refinements: vector side tables with a vector index and Oracle Text (5.9), typed labels as views (drivine4j phase 8), block caching for saves.
