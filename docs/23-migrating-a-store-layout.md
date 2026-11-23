## Migrating a graph from store layout 1 to layout 2

Drivine for TypeScript 6 holds a graph on Postgres, Oracle and SQLite in **store layout 2**:
- a temporal value is held as a tagged map of its ISO 8601 text and the key it orders by, so it compares and sorts as its kind;
- a float stays a float;
- a property whose name begins with `$` is held under one more `$`.

Every Drivine for TypeScript before 6, drivine4j before 0.8.0 and drivine-python before 0.9.0 wrote **layout 1**. Layout 1 held each value as the store's JSON alone: a date as its text, a whole-number float as a whole number.

A graph that still holds your nodes in layout 1 is refused on its first connection, with a `StoreLayoutError` that names the graph (its `graph`, and `from`, the earlier layout). There are two ways forward:
- **Export and import.** Export the graph with the Drivine version that wrote it, and import it with this one.
- **Migrate it in place**, as this page describes. `StoreLayoutMigration` rewrites every row once, in batches, and can be stopped and resumed at any point.

Neo4j, Memgraph and FalkorDB hold values natively and have no store layout: nothing on this page applies to them.

### Which graphs it migrates

It migrates graphs on Postgres, Oracle and SQLite written by Drivine for TypeScript 5.0.0, drivine4j 0.7.0 or drivine-python 0.8.0, the last releases of layout 1. Each library's tests write a graph with its own last layout-1 release and migrate it, on each store. A graph an earlier release wrote is in the same layout and is migrated the same way, but those releases aren't tested.

The shared compiler decides every step, so all three libraries migrate a graph alike, into the layout 2 each of them reads.

### Before you start

1. **Stop everything that writes to the graph.** A migration runs while nothing else uses the graph. A resume refuses a graph whose size or schema marker changed since the migration began, and a write made during the run of a value it didn't expect stops it as `invalid`.
2. **Take a backup.** The migration has no down-migration: a graph changed under it, or one you want back as it was, is restored from the backup.
   - **Postgres:** `pg_dump -t '<graph>_*'`.
   - **Oracle:** Data Pump (`expdp`) of the graph's tables.
   - **SQLite:** a copy of the file, taken while nothing has it open, or `sqlite3 <file> ".backup <copy>"`.
3. **Give it the provider.** It runs on connections of its own from the provider's pool, never one of a `TransactionContextHolder`'s transaction. On Postgres and Oracle it takes two at once (one holds the lock), so the pool needs room for both.

### 1. Declare what layout 1 can't tell

Layout 1 can't tell which texts are dates or moments, which whole numbers are floats, and which lists of numbers or texts are bytes. Tell the migration, label by label and property by property:

```typescript
import { Declaration, declarationsOf, StoreLayoutMigration } from '@liberation-data/drivine';

const declarations: Declaration[] = [
    ...declarationsOf(Person),
    ...declarationsOf(Knows, 'KNOWS'),
    { label: 'Person', property: 'born', kind: 'date' },
    { label: 'Event', property: 'at', kind: 'datetime' }
];
```

`declarationsOf(Person)` reads a node fragment's fields declared a `Date` (a moment, `datetime`), as the object manager knows them, under each of its labels, inherited ones too. `declarationsOf(Knows, 'KNOWS')` does the same for a relationship fragment.

TypeScript doesn't record more than that, so declare these by hand:
- a date with no time;
- a float;
- a list of `Date`s, which TypeScript records as an `Array`.

Some fields layout 1 saved in another form than their kind's, and these get no declaration, so they are kept as they are:
- a `@JsonPacked` field, saved as JSON text;
- bytes (`Uint8Array`, `Buffer`), which 5.0 saved as `JSON.stringify` writes them.

A property nobody declares is kept as layout 1 held it: a date-looking text stays a text.

### 2. Dry run

```typescript
const migration = new StoreLayoutMigration(provider); // a PostgresConnectionProvider, say
const report = await migration.migrate(declarations, { dryRun: true });
```

A dry run writes nothing. Its `MigrationReport` gives:

- **`tables`:** the rows of nodes and of relationships, and how many would change.
- **`properties`:** for each declared label and property, the count of each change, and each value that is no value of its declared kind, with why.
- **`candidates`:** properties you didn't declare whose values all read as one kind. Declare them if they are that kind. They are never applied otherwise.
- **`collisions`:** the uniqueness constraints' keys that may collide.

**What a dry run's collisions cover.** A dry run checks each uniqueness constraint over the values as layout 1 holds them. Some keys are distinct in layout 1 but one value in layout 2, and the dry run doesn't report those. For example, two spellings of one moment, `2024-03-15T10:30:00.5Z` and `2024-03-15T10:30:00.500Z`, declared `datetime` under a unique key. Such a collision is found after the writes: the migration stops at `collisions`, and once corrected it resumes (see [Collisions](#collisions)). Checking rewritten values in the dry run is tracked in drivine-cypher-spec#429.

### 3. Migrate

```typescript
const report = await migration.migrate(declarations);
console.log(report.status === 'migrated' ? report.tables : `${report.status}: ${report.message}`);
```

The migration reads and rewrites the nodes, then the relationships, 1000 rows at a time (`batchSize`). Each batch's rows are written with the migration's checkpoint in one transaction, so each row is rewritten exactly once. Then it checks the uniqueness constraints, drops layout 1's indexes, stamps the graph layout 2 and drops its checkpoint.

How a migration ends (`MigrationReport.status`):

| Status | Meaning | What to do |
|---|---|---|
| `migrated` | The graph is in layout 2. | Start the application (see [After](#after-the-migration)). |
| `current` | The graph is in layout 2 already. | Nothing. |
| `empty` | The graph holds no nodes of yours. | Nothing. A first connection stamps it. |
| `dryRun` | A dry run's report. Nothing was written. | Read it, then migrate. |
| `invalid` | A declared property holds a value that isn't of its kind. Nothing was written. | Declare it otherwise, correct the value, or keep such values (below). |
| `collisions` | Keys a uniqueness constraint holds are one value in layout 2. Every row is written, and the graph keeps its checkpoint. | Correct the rows, and run it again. |
| `inProgress` | A dry run of a graph part way through its migration. | Run the migration again to resume it. |
| `refused` | A graph of another layout, one changed since its migration began, a resume with other declarations, or another migration running. | Read the message. |
| `failed` | A statement failed, and the message is the store's. | Fix the cause, and run it again to resume. |

**Values not of their kind.** Pass `keepInvalid: true` to keep each such value as it is, named in the report, rather than refuse the graph. A dry run with `keepInvalid: true` lists them all first. Resume a migration with the same `keepInvalid` it began with.

### Collisions

The `collisions` report lists each constraint's label and properties, with a sample of the keys that collide. Correct the rows with the store's own tools, keeping their values as layout 2 holds them: delete the duplicate, or change its key. Then run the migration again. The rows are written already, so it checks the constraints again and finishes.

### Stopping and resuming

A migration stopped at any moment can be resumed: by `failed`, by `collisions`, by a killed session, or by the process ending. Run `migrate` again with the same declarations. A resume carries on after the last batch committed, and never rewrites a row twice.

Until every row is written, a resume is refused in these cases:
- the declarations or `keepInvalid` differ from those the migration began with;
- the graph's size, stamp or schema marker changed since it began, which means something wrote to it.

Restore such a graph from the backup.

While a migration is part way through, the graph is refused to the application's connections, and a dry run of it reports `inProgress`.

### After the migration

- **Indexes and constraints:** the migration makes none. It drops layout 1's, which index values as layout 1 held them. Your application's schema plan makes the ones it declares at its next start, as it does on a new store (see [Schema Management](08-schema-management.md)). Until then a query that would read one scans, and no uniqueness constraint is enforced, so start the application, or ensure its schema, before anything else writes.
- **The count store** (`<graph>_count2`) is left empty, as a new store has it. Nothing reads it in this release (drivine-cypher-spec#349).
- **The rest is unchanged:** the graph's nodes and relationships keep their ids, and its stamp, its `DrivineStore` node, is kept and given layout 2.
