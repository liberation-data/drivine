# The Cypher spec

These files say what a statement in Drivine's flavour of Cypher gives on each store Drivine runs it on. The graph engines run Cypher themselves. On Postgres, Oracle and SQLite, Drivine compiles it to SQL. The three Drivine libraries (drivine4j, drivine for TypeScript, drivine-python) run the same files, so a statement gives the same rows from each of them.

- `queries.yaml`: statements that read, run over the graph the file's `graph` writes. The graph is emptied and written again before each case.
- `writes.yaml`: statements that write, run from an empty graph. Each case's steps run in turn, so a step reads what the steps before it wrote.
- `temporal.yaml`: openCypher's temporal values (dates, times, moments and durations), run from an empty graph. A graph engine's driver gives a temporal value as a value of its own, and a SQL store gives its ISO text, so the cases read a value's fields.
- `refusals.yaml`: statements each SQL store's compiler refuses, and its message. They are compiled with no store.
- `schema.yaml`: Neo4j's schema commands (`CREATE INDEX`, `CREATE CONSTRAINT`, `DROP …`, `CALL db.awaitIndexes`), and the schema spec a SQL store applies each as, or its refusal. They are read with no store. See [Schema commands](#schema-commands).
- `host.yaml`: what each library's own code does with the values compiled SQL hands it: the functions it registers on SQLite, and how it reads a column of a statement's rows. Read with no store. See [Host functions and readers](#host-functions-and-readers).
- `cli/`: the `drivine` CLI's contract, which runs Cypher on every store and prints its results as cypher-shell does, and `cli.yaml`, the cases each build of it runs. See `cli/README.md`.
- `model/`: the model file each library writes of an application's fragments, views and how they are stored, which Drivine Studio reads. See `model/README.md`.

A runner empties the whole graph before each case, not just the nodes that carry the file's `label`. The statements match plain labels, such as `MATCH (p:Person)`, so a node another test left behind would show up in their rows.

## A case

```yaml
- name: "Optional match"
  description: "OPTIONAL MATCH keeps the row, with null where it finds nothing."
  steps:
    - cypher: "MATCH (p:Person) OPTIONAL MATCH (p)-[:KNOWS]->(f) RETURN p.name, f.name ORDER BY p.name"
      rows: [["Carrie", null], ["Hugo", null], ["Keanu", "Carrie"], ["Laurence", "Keanu"]]
```

A case has a short `name`, unique in its file, that a library's runner shows and skips by, and a one-line `description` of what it checks. Then its steps, run in turn.

A step has:

| Key | What it is |
|---|---|
| `cypher` | The statement. |
| `parameters` | The values bound to its parameters. |
| `rows` | The rows it gives. A row of one column is its value, and a row of several is a list of their values, as `PersistenceManager.query` gives them. |
| `error` | The message it fails with, a list of messages any one of which passes, or `true` for a failure of any message. |
| `only`, `except` | The stores the step runs on, or doesn't. A store is `neo4j`, `memgraph`, `falkordb`, `neptune`, `postgres`, `oracle` or `sqlite`. The group `graph` names the graph engines, and `sql` names the stores Cypher is compiled for. |
| `unordered` | The rows are compared in any order. |
| `unorderedLists` | Each list within the rows is compared in any order. |
| `keyOrder` | Each map's keys are compared in order too. |
| `note` | Why the step is there. It is not read. |

A step with no `rows` and no `error` is run, and what it gives is not checked.

On Neo4j a statement runs in the database's default language, Cypher 25 on Neo4j 2026.10. A step that pins what Cypher 5 gives, where the two differ, starts its statement with `CYPHER 5` and runs `only: [neo4j]`.

## Values

- A whole number and the same number written with a fraction are different values: `2` is not `2.0`.
- `{$repeat: "x", times: 3000}` is the text `x` written 3000 times, in parameters and rows alike.
- `{$float: "NaN"}`, `{$float: "Infinity"}` and `{$float: "-Infinity"}` are NaN and the infinities, in parameters and rows alike: not every YAML parser reads `.nan` and `.inf`. NaN in the rows is the same as NaN there.
- Any other map is the map it is, even one keyed with `$`, such as `{$numberDouble: "1"}`.
- Quote every string. A YAML 1.1 parser, such as SnakeYAML or PyYAML, reads a bare `y`, `yes`, `no` or `on` as a boolean.
- `writes.yaml` binds and expects a whole number beyond 2^53. A library whose language reads YAML numbers as doubles skips those steps, named in its own runner. Otherwise a library skips nothing: a store that differs says so with `except` here.

## Schema commands

A SQL store runs Neo4j's schema DDL through its library's schema machinery: a `CREATE` is ensured as the schema API ensures a spec, under an owner of its own, `ddl`, so the item has the name, the expressions and the inventory entry the API gives it. `writes.yaml` runs such statements on Neo4j and the SQL stores alike. `schema.yaml` pins how each library reads one, with no store:

```yaml
- name: "Range index"
  description: "CREATE [RANGE] INDEX over one property or several is a range index."
  steps:
    - ddl: "CREATE INDEX person_name IF NOT EXISTS FOR (p:Person) ON (p.name)"
      create: {kind: "RANGE_INDEX", label: "Person", properties: ["name"], alias: "person_name", ifNotExists: true}
```

A step has `ddl`, the statement, an optional `note`, and one of these, which says what it reads as:

| Key | What it reads as |
|---|---|
| `create` | A spec to create: its `kind` (`RANGE_INDEX`, `UNIQUENESS_CONSTRAINT`, `FULLTEXT_INDEX`, `VECTOR_INDEX` or `TEXT_INDEX`, as a store's catalog names it), `label` and `properties`; `alias`, the statement's name where it is not the name the schema API gives the spec; `ifNotExists`; and `options`: a full-text index's `analyzer`, and a vector index's `dimensions`, `similarity` (`COSINE` or `EUCLIDEAN`), `hnswM`, `hnswEfConstruction` and `quantizationEnabled`. A key left out is null, false or empty. The spec itself has no name: the schema API's is the one it is made under, and the alias is kept beside it, so that a `DROP` by it finds the item. |
| `drop` | A drop of the item by its name: `kind` (`INDEX` or `CONSTRAINT`), `name`, and `ifExists`. |
| `await` | `true`: a wait for indexes, which does nothing on a SQL store. |
| `reserved` | Drivine's own uniqueness constraint, of the schema marker's `scope` or the store stamp's `key`, by any name: its `label` and `properties`. It is made as the library makes it for itself, and recorded in no owner's inventory. |
| `cypher` | `true`: not a schema command, but Cypher, compiled as any other statement. |
| `error` | The message it is refused with. A SQL store's compiler refuses it with the same message (see `refusals.yaml`). |

## Host functions and readers

Compiled SQL calls functions each library registers on SQLite (`drivine_equal`, `drivine_add` …, and `regexp`, which SQLite calls for its `REGEXP` operator), and each library reads the rows itself, where a store's JSON holds no NaN or infinity: SQLite writes NaN as the tag `{"$numberDouble":"NaN"}` and an infinity as `9e999`, and Postgres, in the rows of a statement given NaN or an infinity, writes stand-in numbers past any double's. That code is each library's, not the compiler's, so `host.yaml` pins it, run by each library's unit suite with no container: on an in-memory SQLite with its functions registered, and on its row reader.

```yaml
- name: "drivine_add"
  description: "drivine_add(a, b) is Cypher's a + b of two JSON values, as JSON text: NaN adds as a number …"
  pairs:
    writes.yaml: ["NaN worked out from stored infinities", "NaN and the infinities written"]
  steps:
    - function: "drivine_add"
      args: ['9e999', '-9e999']
      result: '{"$numberDouble":"NaN"}'
```

A case has a `name`, unique in the file, a `description`, `pairs`, and its steps. A step has an optional `note` and is one of these:

| Keys | What it checks |
|---|---|
| `function`, `args`, `result` | The SQLite function, called with `args`, gives `result`. Each argument and the result is a SQL value: a text (the JSON text a function of JSON values takes, a rounding mode, or a regular expression), a whole number, a float, or null. A text result is compared exactly. `regexp` is called as SQLite calls it for `text REGEXP pattern`: `regexp(pattern, text)`, the pattern first. |
| `function`, `ascending` | The function of one argument, called on each of `ascending` in turn, gives values that ascend as SQLite orders them, each before the next. For `drivine_sort_key` of a list, whose text is each library's own: only its order is pinned. |
| `read`, `value` | A column of a compiled statement's rows reads as `value`, as `PersistenceManager.query` gives it. `read` has the `store` (`postgres` or `sqlite`), `nonFinite` (whether the statement was given NaN or an infinity, which the compiled statement says), and the `column`'s raw JSON text: a text, or a list of texts and `$repeat`s written one after the other. |

Values are written as in the other files: `{$float: "NaN"}` is NaN, `{$repeat: …}` a text repeated, and any other map, `{$numberDouble: "2.0"}` among them, is the map it is.

**Pairs.** A host function and the compiled statements that call it are one contract: a change to one alone changes what a statement gives. So each case's `pairs` names, by file, the store cases in `queries.yaml`, `writes.yaml` and `temporal.yaml` that rely on its steps, and a runner checks, before the case passes:

- that each case named is in its file;
- for each function its steps call, that a step of a paired case, run on SQLite, compiles to SQL that calls it: for `regexp`, SQL that holds the operator `REGEXP`;
- for each `store` and `nonFinite` its steps read, that a step of a paired case, run on that store, compiles with that `nonFinite`.

A change to a host vector names the store cases it moves, and a change to a paired store case shows which host vectors it leans on. A host case with no pairs, or whose pairs no longer rely on it, fails.

**Regular expressions.** On SQLite a regular expression the compiler writes, given to `REGEXP`, `drivine_regex_group` or `drivine_regexp_replace`, is read by each library's own language: Java's, JavaScript's or Python's, each rewritten from Java's as its library rewrites it. So the compiler writes them only with what `host.yaml`'s `regexp` case pins every library reads alike: `^` for the text's start and `\z` for its end; each class written out, with `\t`, `\n`, `\f`, `\r`, `\xNN` and `\uNNNN` and ranges of them, and `[0-9]` for a digit; a backslash before a character of the syntax (`^$\.*+?()[]{}|/`) for the character; groups, `(?:…)`, alternatives, and `?`, `*`, `+` and `{m,n}`. It writes none of what the libraries read otherwise: `\s`, `\d`, `\w`, `\b` or any other class escape, which are Unicode's on drivine4j and partly ASCII's on Drivine for TypeScript; `$`, which in Java matches before a line break that ends the text too; `\Z`; `.`, which in Java matches no U+0085; a class within a class, or `&&` in one, which Java reads as their union and intersection; a POSIX class (`[:alnum:]`) or `\p{…}`; or a flag group. A pattern a statement gives `=~` is its own, read as Java reads it: the compiler's group around it, `^(?:…)\z`, is written as above, and a leading `(?i)` in it is pinned. The compiler's tests check every pattern it writes on SQLite over the whole spec.

## Changing the spec

These files are a contract between the three libraries. They live in [drivine-cypher-spec](https://github.com/liberation-data/drivine-cypher-spec), and each library copies a tagged version into its tests, unchanged, with a script of its own (`scripts/sync-cypher-spec.sh` in drivine4j). A change of what the compiler gives or refuses lands there first, in a tagged release, and each library then moves to that tag.

Some tests stay in each library's own suite: values that change on every run (a UUID, the time), parameters of a language's own temporal types, statements built in code (hundreds of `CREATE`s), and whatever needs a connection of its own (a rolled-back transaction).
