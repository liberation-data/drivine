# Upgrading to 4.0

Drivine for TypeScript 4.0 compiles Cypher to SQL, for Postgres, Oracle and SQLite, with the shared compiler,
[`@liberation-data/drivine-cypher-compiler`](https://www.npmjs.com/package/@liberation-data/drivine-cypher-compiler).
That is the compiler drivine4j runs: the Kotlin Multiplatform module in
[drivine-cypher-spec](https://github.com/liberation-data/drivine-cypher-spec/tree/main/compiler), built for Wasm. 3.x
had a compiler of its own. Each fix in drivine4j's was ported to it by hand, and it had drifted: the Cypher spec held
381 of its steps on 3.x, 109 on Postgres, 150 on Oracle and 122 on SQLite, which it gave otherwise than Neo4j. Now the
compiled SQL is drivine4j's, byte for byte, and a statement gives the same rows in either library. A compiler fix lands
once, in the module, and reaches this library with the next version of the package.

Nothing changes for a statement run on Neo4j, Memgraph, FalkorDB or Neptune: the compiler isn't loaded there. On a SQL
store, most statements give what they gave before. What changes is below, the breaking changes first. Each links to
the spec's cases that pin it, in [drivine-cypher-spec](https://github.com/liberation-data/drivine-cypher-spec).

## Breaking changes

### Node 22 or later

The shared compiler's Wasm build needs WasmGC, which Node has from 22. Drivine 4.0 is tested on Node 24.

### Statements Neo4j refuses are refused

The shared compiler refuses what Neo4j refuses, with a message of its own, where 3.x compiled some of these statements
and gave rows. A statement that ran on 3.x may now fail with a `DrivineError`:

| The statement | Its message |
|---|---|
| Two items of one name: `RETURN 1 AS a, 2 AS a` | Two items are named a, as Cypher refuses: name each item of a WITH or a RETURN once, with AS. |
| A pattern in a `WITH`'s `WHERE` naming a variable the `WITH` drops, or naming one from before a `WITH` that groups: `MATCH (p) WITH p AS q WHERE (p)-->() RETURN q` | p is not defined: a variable is bound by a pattern, a WITH or an UNWIND before it is used. |
| A temporal map field of a text: `UNWIND ['hello'] AS t RETURN localtime({time: t})` | localtime() takes a localtime, a time, a localdatetime or a datetime for time, not a text. |
| A float literal past a double's range: `RETURN 1e400` (#508) | 1e400 is past the range of a float, from -1.7976931348623157E308 to 1.7976931348623157E308. |
| A float as the start or length of `left()`, `right()` or `substring()`: `WITH 1.5 AS n RETURN left('hello', n)` (#538) | left() takes an integer for its length, not a float, as in Neo4j. |

These are the spec's `refusals.yaml` cases "Two items of one name", "Pattern in a WITH's WHERE naming a variable the
WITH drops", "Variable before a WITH that groups, in its WHERE", "Temporal map field of a text worked out", "Float too
large" and "Start or length of a text function".

A `MERGE` whose pattern gives a property that is null or NaN now fails when it would make the node or relationship, as
on Neo4j, where 3.x made a new one on each run (#569; the spec's "MERGE of a null or NaN property"):

```cypher
MERGE (n:Person {name: $name})   // with name null: fails, where 3.x made a node each time
```

### A whole float parameter is bound as a whole number: `cypherFloat()`

A JavaScript number can't tell `5.0` from `5`, so Drivine binds a whole number as an integer, as Neo4j's driver does
for an integer Neo4j type. On 3.x, Drivine's own compiler typed some values from the statement around them, so a whole
float written by `CREATE (n {f: $f})` read back on Postgres and SQLite as `5.0`. With the shared compiler it reads back
as `5` on every SQL store. Where a parameter is a float, say so:

```ts
import { cypherFloat } from '@liberation-data/drivine';

await pm.query(new QuerySpecification('CREATE (:Reading {value: $v})').bind({ v: cypherFloat(5) }));
// toString(n.value) is '5.0' on every store, as drivine4j's double gives it.
```

`cypherFloat(x)` is a float on a SQL store. A graph engine is given the number itself, which Neo4j's driver sends as a
float.

### A SQLite map of exactly `{"$numberDouble": "NaN"}` is NaN

SQLite's JSON has no NaN, so a NaN is written as the map `{"$numberDouble": "NaN"}`, exactly, as drivine4j writes it
(#675). A map a user stores that is exactly that, one key and that text, now reads, compares and adds as NaN. Any other
map, with another key or another text, is the map it is.

### Drivine's own compiler is gone

`PostgresCypherCompiler`, `OracleCypherCompiler`, `SqliteCypherCompiler`, `SqlCypherCompiler`, `CypherReader` and the
Cypher AST under `src/cypher` were never exported from the package's entry, but could be imported by path. They are
removed, with no replacement: the shared compiler is called through the connections. Its request and answer, JSON
text, are in its [README](https://github.com/liberation-data/drivine-cypher-spec/blob/main/compiler/README.md).

## NaN and the infinities

On 3.x a NaN or infinite parameter was bound as null (#344), Postgres worked float arithmetic out as `numeric` (#536),
so `0.1 + 0.2` gave `0.3` and `0.0 / 0.0` failed, and `toFloat('NaN')` gave null (#573). They now give what Neo4j
gives, on every SQL store:

```cypher
RETURN 0.0 / 0.0, 1.0 / 0.0, $nan = $nan, toFloat('Infinity')   // NaN, Infinity, false, Infinity
```

- **Parameters:** a NaN or infinite parameter is bound, compared, added and written as itself (#344).
- **Arithmetic:** float arithmetic is a double's on Postgres (#536); NaN is equal to nothing, itself included, on
  Oracle (#512); `sum()` and `avg()` of both infinities give NaN on SQLite (#579).
- **Text:** `toFloat()` reads `NaN`, `Infinity` and `-Infinity` as Java does (#573).
- **Storage:** a NaN or an infinity a statement writes is kept, and read back as itself.

The spec's cases: "NaN and the infinities as parameters", "NaN worked out", "NaN and the infinities written", "NaN
worked out from stored infinities" and "NaN and the infinities given to SET and MERGE".

## Oracle

- **Paths:** a path a `WITH` passes on gives each row's own nodes and relationships, where 3.x gave every row the first
  row's (#556).
- **A write's rows:** a statement that writes and returns rows gives them back in one row, as JSON text, as 3.x did.
  node-oracledb's thin mode reads only the first rows of the shape drivine4j reads, a row each
  (oracle/node-oracledb#1795), so Drivine asks the compiler for this one until a release of the driver reads them all
  (#684). The whole of a write's result is then held in memory at once, so a write that returns very many rows is
  bounded by that. A read returns its rows as any query does.
- **Floats in a write's rows:** Oracle writes that text as extended JSON, so a float stays a float there, NaN and the
  infinities too. A map of your own whose one key is `$numberDouble` reads back, in a write's rows, as the float it
  names.

## Whole numbers past 2^53

A whole number literal past 2^53, `9007199254740993`, is compiled as the number it is, where 3.x rounded it to the
nearest JavaScript number (#417). A parameter bound as a `bigint`, or as the Neo4j driver's `Integer`, keeps every digit
too.

## Loading and speed

The compiler is required on the first statement compiled for a SQL store, and its Wasm module started on that
statement's compile: about 50 to 65 ms, once a process. An application on a graph engine alone never loads it.

After that, a statement compiles in about a quarter of a millisecond, at the median, on Postgres and SQLite, much as on
3.x. On Oracle it takes about twice 3.x's time, at the median, as the shared compiler writes some of Oracle's temporal
SQL slowly (liberation-data/drivine-cypher-spec#122). `npm run bench:compiler` measures it
([Building from source](18-building-from-source.md)).
