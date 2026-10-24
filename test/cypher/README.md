# The Cypher spec

These files say what a statement in Drivine's flavour of Cypher gives on each store Drivine runs it on. The graph engines run Cypher themselves. On Postgres, Oracle and SQLite, Drivine compiles it to SQL. The three Drivine libraries (drivine4j, drivine for TypeScript, drivine-python) run the same files, so a statement gives the same rows from each of them.

- `queries.yaml`: statements that read, run over the graph the file's `graph` writes. The graph is emptied and written again before each case.
- `writes.yaml`: statements that write, run from an empty graph. Each case's steps run in turn, so a step reads what the steps before it wrote.
- `temporal.yaml`: openCypher's temporal values (dates, times, moments and durations), run from an empty graph. A graph engine's driver gives a temporal value as a value of its own, and a SQL store gives its ISO text, so the cases read a value's fields.
- `refusals.yaml`: statements each SQL store's compiler refuses, and its message. They are compiled with no store.
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

## Values

- A whole number and the same number written with a fraction are different values: `2` is not `2.0`.
- `{$repeat: "x", times: 3000}` is the text `x` written 3000 times, in parameters and rows alike. Any other map is the map it is, even one keyed with `$`, such as `{$numberDouble: "1"}`.
- Quote every string. A YAML 1.1 parser, such as SnakeYAML or PyYAML, reads a bare `y`, `yes`, `no` or `on` as a boolean.
- `writes.yaml` binds and expects a whole number beyond 2^53. A library whose language reads YAML numbers as doubles skips those steps, named in its own runner. Otherwise a library skips nothing: a store that differs says so with `except` here.

## Changing the spec

These files are a contract between the three libraries. They live in [drivine-cypher-spec](https://github.com/liberation-data/drivine-cypher-spec), and each library copies a tagged version into its tests, unchanged, with a script of its own (`scripts/sync-cypher-spec.sh` in drivine4j). A change of what the compiler gives or refuses lands there first, in a tagged release, and each library then moves to that tag.

Some tests stay in each library's own suite: values that change on every run (a UUID, the time), parameters of a language's own temporal types, statements built in code (hundreds of `CREATE`s), and whatever needs a connection of its own (a rolled-back transaction).
