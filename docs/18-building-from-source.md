## Building from Source

```bash
npm install
npm run build
npm test         # starts a test container for each engine, needs Docker, and runs the suites in stages
```

The tests' datasources are in `.env.test`. Put overrides in `.env.test.local`, which git ignores: `USE_LOCAL_NEO4J=true`
(or `_MEMGRAPH`, `_FALKORDB`, `_POSTGRES`, `_ORACLE`) to use an instance of your own while you iterate, and
`ORACLE_TESTS=true` to run the Oracle suites too. See [TEST_CONTAINERS.md](../TEST_CONTAINERS.md).

### Benchmarking the Cypher compiler

`npm run bench:compiler` measures the shared Cypher compiler (`@liberation-data/drivine-cypher-compiler`, the
installed dependency) as Drivine runs it, through the built `SharedCypherCompiler`, on Postgres, Oracle and SQLite: the
cold numbers, each the median over several fresh Node processes that have loaded Drivine, and the warm compile's
median and p99 over the statements of the Cypher spec in `test/cypher`, with the statements it refuses counted. The
cold numbers are the load (the package's require and the start of its Wasm module, by a request that names no store,
so the same work on every store), the store's first compile (`RETURN 1`), and the next compile (the spec's first
statement that compiles on the store). It compiles only, so it needs no database, but it needs
Drivine built:

```bash
npm run build
npm run bench:compiler
```

It fails when the median load is over 150 ms, the budget of
[#685](https://github.com/liberation-data/drivine/issues/685), in any store's processes. The budget is for the load
alone: a store's first compile costs more on some stores than on others (on Postgres, tens of ms more), and is
watched by the nightly instead. Beside the warm medians it prints #685's pre-switch
numbers, Drivine's own compiler (since deleted) on an Apple M2 Max, for reference only: they're of another machine and
a compiler that is gone, so they aren't enforced. Oracle's warm compile is over 1.5x of them until
[drivine-cypher-spec#122](https://github.com/liberation-data/drivine-cypher-spec/issues/122).

To time a candidate build of the compiler before it is published, name its `.tgz` (in the spec's `compiler`,
`./gradlew npmPackage`, then `npm pack` of `build/npm`), or the package's directory where it is installed (such as
`node_modules/@liberation-data/drivine-cypher-compiler`, from which `@js-joda/core` resolves), as
`DRIVINE_WASM_COMPILER`. Drivine's own require of the package is pointed at it:

```bash
DRIVINE_WASM_COMPILER=path/to/liberation-data-drivine-cypher-compiler-<version>.tgz npm run bench:compiler
```

`npm run bench:compiler -- --json <file>` writes the numbers as JSON too. The top of `scripts/bench-compiler.js` says
what each number times, and how to set the number of runs and rounds.

CI's `compiler bench` job runs it on every pull request, with fewer runs and rounds, and puts its tables in the job's
summary; it fails only on the load's budget. The first compile and the warm compile have no ceiling, as shared
runners are too noisy for one: instead the nightly's `compiler bench against the last nightly` job
(`scripts/bench-regression.js`) compares each store's warm median and first compile with the last nightly's on master
that passed, and fails when one rose by more than half, in a run and in a rerun. The first night, with nothing to
compare with, it records its numbers and passes; a measure the last nightly's numbers haven't (the first compile, the
first night after the bench timed it apart from the load) is recorded and not compared. Its summary says
when the compiler's version or the runner's machine changed since then. A slowdown that is accepted never passes that
check, so run the nightly by hand with `record-bench` ticked: it records that night's numbers, without comparing them,
as the next baseline once the nightly passes.
