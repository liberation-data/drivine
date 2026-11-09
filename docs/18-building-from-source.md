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
cold load (in a fresh Node process that has loaded Drivine, the package's require and first compile) and the next
compile, each over several fresh processes, and the warm compile's median and p99 over the statements of the Cypher
spec in `test/cypher`, with the statements it refuses counted. It compiles only, so it needs no database, but it needs
Drivine built:

```bash
npm run build
npm run bench:compiler
```

It fails when a store's median cold load is over 150 ms, the budget of
[#685](https://github.com/liberation-data/drivine/issues/685). Beside the warm medians it prints #685's pre-switch
numbers, Drivine's own compiler (since deleted) on an Apple M2 Max, for reference only: they're of another machine and
a compiler that is gone, so they aren't enforced. Oracle's warm compile is over 1.5x of them until
[drivine-cypher-spec#122](https://github.com/liberation-data/drivine-cypher-spec/issues/122).

To time a candidate build of the compiler before it is published, name its `.tgz` (in the spec's `compiler`,
`./gradlew npmPackage`, then `npm pack` of `build/npm`), or a directory it is installed in, as `DRIVINE_WASM_COMPILER`.
Drivine's own require of the package is pointed at it:

```bash
DRIVINE_WASM_COMPILER=path/to/liberation-data-drivine-cypher-compiler-<version>.tgz npm run bench:compiler
```

`npm run bench:compiler -- --json <file>` writes the numbers as JSON too. The top of `scripts/bench-compiler.js` says
what each number times, and how to set the number of runs and rounds.

CI's `compiler bench` job runs it on every pull request, with fewer runs and rounds, and puts its tables in the job's
summary; it fails only on the cold load's budget. The warm compile has no ceiling, as shared runners are too noisy for
one: instead the nightly's `compiler bench against the last nightly` job (`scripts/bench-regression.js`) compares each
store's warm median with the last nightly's on master that passed, and fails when one rose by more than half, in a run
and in a rerun. The first night, with nothing to compare with, it records its numbers and passes.
