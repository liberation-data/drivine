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

**Approach: ts-morph build-time codegen.** Ship a CLI (`drivine-codegen`) run as a build step; scans for `@GraphView` / `@NodeFragment` classes and emits `<View>QueryDsl.ts`. Deterministic output, no I/O beyond writing files. (Rejected: TS transformers — fragile tooling; runtime proxies — lose type info when nested.)

Operators: `eq, neq, gt, gte, lt, lte, in, contains, startsWith, endsWith, isNull, isNotNull, hasItem, instanceOf<T>`; `any` / `none` over to-many relationships; dynamic runtime-key predicates.

Composition: chained `where` = AND; `anyOf([...])` = OR. Bare-fragment queries supported.

Ordering & paging: `asc`, `desc`, `nullsFirst()`, `nullsLast()`, order by expression over root properties, database-side ordering of nested collections, `limit` / `skip`, index-aware keyset pagination.

Also drives `groups`, `deleteAll`, `loadNearest` / `loadMatching` filters.

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
- [ ] Tier 1 step 3 — `GraphBackend` + `CypherGrammar`: **moved to the start of Tier 2.** `GraphBackend` produces object-manager statements, and there is no object manager to call it yet; the grammar's differences only matter for generated Cypher. Build it when generation starts, against real engines.
- [x] **Tier 1 step 4 — FalkorDB.** `src/connection/falkordb/` on the `falkordb` npm client (6.8). `DatabaseType.FALKORDB`; graph name from `databaseName`, default `graph` (as drivine4j); port 6379. Honours `TransactionMode` via `AutoCommitTransactions`. `FalkorDbParameterCoercer`: `Date` → nine-digit ISO text (same as drivine4j, so JVM- and Node-written stores compare alike), `Set` → list, `undefined` → null, and it **refuses map keys / parameter names that aren't plain identifiers** — the client writes params into the statement text with unquoted keys and FalkorDB accepts no quoted form, so such a key could inject Cypher. Positional `$1` → `$p1`. Result mapper returns nodes/relationships as properties and Temporal datetimes/dates as `Date` (UTC). Cursor pages with SKIP/LIMIT. Added `skipLibCheck` to tsconfig (`@redis/client` typings don't compile against our `@types/node`); no published `.d.ts` imports `falkordb`. Test container: `drivine-falkordb` (`localhost:16379`).
  - Follow-ups: `falkordb` is a hard dependency (pulls in the redis client) — consider an optional peer with a lazy `require`. FalkorDB can't store map properties (`@JsonPacked`, step 8). `NonAtomicBatchException` waits for `saveAll`. Native constraint commands wait for schema management (Tier 3).
- [x] **Tier 1 step 5 — Memgraph.** `DatabaseType.MEMGRAPH`, on `Neo4jConnectionProvider` with optional credentials (auth is off in a default Memgraph), as drivine4j does. Integration test covers read/write, rollback and cursors. Test container: `drivine-memgraph` (bolt `localhost:17688`).
  - Found: the Neo4j driver sends every JS number as a float, so `range(1, $n)`, `list[$n]` and `LIMIT $n` fail with a JS number on Memgraph, and the last two on Neo4j too. Pre-existing; see Open questions.
- [ ] Tier 1 step 6 — Neptune full (SigV4 + pool): **deferred** (2026-10-18, user call: low priority). Neptune-basic stays as is.
- [ ] Tier 1 step 7 — contended-retry with jitter: **moved to Tier 2 (2.6).** In drivine4j it lives in `SaveExecutor.whenNotContended` and asks the backend whether a failure is contention; there are no saves to retry yet, and retrying inside a caller's transaction would be wrong.
- [ ] Tier 1 step 8 — `@JsonPacked`: **moved to Tier 2 (2.11).** It's a mapping decorator; it needs the object mapping.
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
- [ ] 2.8 split into:
  - [x] 2.8a `NullPolicy` (IGNORE default, CLEAR clears null/undefined own-key fields of the object or a view's root, via `+= {k: null}` — verified on all three; related nodes always IGNORE) and `only` / `except` on `save` (field names of the object / view root; both together refused; id or stamp in `only` refused). Change detection fixed so clearing an absent property isn't a data change. TS limit: a declared-but-never-assigned field isn't an own key, so CLEAR can't see it.
  - [x] 2.8b `update(type, id, change, attempts = 3)`: load, deep snapshot (`ObjectUtils.deepCopy`, keeps prototypes), apply change (mutate or return copy), write root fields that differ (`only`) with nulls cleared, and `replace` for relationship lists that lost a node (compared by node id; lists that only grew add). Checked against the loaded stamp; stale → reload and re-apply; deleted meanwhile → undefined; id or class change refused. Related nodes are written whole (drivine4j writes only their changed fields — not yet). `create(object)`: one statement, `MERGE … ON CREATE SET made` then `WITH n WHERE made`, so a node that's there (or that a racing writer makes) stops it before any write → undefined; an object carrying a stamp is refused. Returned as `T | undefined` rather than null.
  - [x] 2.8c `patch(type, id, {set, clear, where, bindings})` → `{found, applied, changed}` (all four outcomes verified on each engine); the node is locked, then found again with the condition in a `WHERE` (Memgraph takes existence checks nowhere else), so a condition may name relationships. Changed → new data token; same values → stamp kept; never stamped → given one. `patchAll(objects, {only | except, nullPolicy})` → one result per object in order; `UNWIND` rows sorted by id (consistent lock order), 1,000 per statement; makes no node. Both refuse the id, stamp, transient fields, a field named twice. Retried on contention outside a transaction. Without the DSL (Tier 4), conditions are Cypher strings over `n`; multi-chunk `patchAll` isn't atomic outside a transaction.
  - [x] 2.8d `saveAll(objects, options)`: fragments of any classes in one statement per 1,000 rows (`FragmentBatchStatement`, a `FOREACH` per class, stamps read before/after for hand-back; not checked — a batch only adds; a stale fragment keeps its old token); each view its own statement, checked as `save`. Outside a caller's transaction, a multi-statement batch runs in a connection-level transaction (provider `connect()` → start → statements → commit / rollback), retried whole on contention; a stale view (no row) aborts and rolls back (verified on Neo4j and Memgraph). FalkorDB: >1 statement runs statement by statement with one warning (WARN) or is refused up front with `NonAtomicBatchException` (STRICT); a single statement is always atomic. `replace` with fragments refused; `only` / `except` / `nullPolicy` apply. Not yet: `bySameBatch` on StaleObjectException.
  - [x] 2.8e `gom.edges`: `relate(from, to, type, props?, mode = MERGE)` → whether both nodes were found and joined (MERGE counts the existing relationships and how many carry the props under both nodes' locks, and marks both ends' links tokens only when something changed; CREATE makes another each call; null props left out); `unrelate(from, to, type)` / `unrelateAll(from, type, direction)` → count removed, both ends marked. `nodeRef(Type, id, ...labels)`. Nodes are matched by id and the fragment's labels plus any extra, never created. Retried on contention. Not yet: drivine4j's `relatedMatch`.
- **Tier 2 through 2.8 done.** Next: 2.9 recursive views/paths/aggregates.
- [ ] 2.9 split into:
  - [x] 2.9a `@ReadOnly` (explicit, or implicit for a fragment list with maxDepth > 1): never written by a save, refused in `replace`, left out of `replace: 'all'`. **Multi-hop fragment lists** (missed in 2.4): read over `*1..maxDepth`, each node once — inline via `reduce` de-dup in the comprehension, CALL form via `collect(DISTINCT …)`; verified on all three; cascades follow them the same way. Relationship fragments refuse maxDepth > 1. **Depth override** per load: `loadAll(type, {where, bindings, depth: {field: n}})` / `load(type, id, {depth})`, by field name as drivine4j's `depth("field", n)`.
  - [x] 2.9b `@Count(type, direction?)` and `@Aggregate({function, type, property?, direction?})` (options object where drivine4j has positional annotation args): single hop, any target node. Inline engines: `size(...)` / `reduce` over a comprehension (AVG = sum ÷ size, null when empty); FalkorDB: `CALL { … OPTIONAL MATCH … RETURN count/sum/avg/min/max }`. SUM/COUNT of none = 0, AVG/MIN/MAX of none = undefined, on all three. Read-only by nature (not relationship fields, so never saved).
  - [x] 2.9c `@GraphPath([hop(type, direction?, label?), …], {target, required?})` (`hop()` helper for Kotlin's `Hop(...)`): far node mapped, each once (inline `reduce` de-dup / CALL `collect(DISTINCT …)`), hop labels constrain intermediate nodes, list / single / required (filters roots). FalkorDB tests the far node's labels after the match (drivine4j's FalkorDB#3332 workaround). Ends at a node fragment only. Read-only.
- **2.9 done.** Next: 2.10 polymorphism.
- [ ] 2.10 Polymorphism: label discrimination, `registerSubtype`, `instanceOf`
- [ ] 2.11 `@PropertyBag`, `@NodeLabels`, relationships of a runtime type, `@Default`, `@EmptyWhenAbsent`, `@JsonPacked`, `@SortedBy`
- [ ] 2.12 `groups`
