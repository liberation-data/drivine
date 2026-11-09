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

`npm run bench:compiler` measures the shared Cypher compiler, built as Wasm (`@drivine/cypher-compiler`), against
Drivine's own in `src/cypher/sql`, on Postgres, Oracle and SQLite: the cold load and first compile in fresh Node
processes, and the warm compile's median and p99 over the statements of the Cypher spec in `test/cypher`. It compiles
only, so it needs no database. The package isn't on npm yet, so give it its `.tgz`, or the directory it is installed in,
after building:

```bash
npm run build
DRIVINE_WASM_COMPILER=path/to/drivine-cypher-compiler-<version>.tgz npm run bench:compiler
```

Without `DRIVINE_WASM_COMPILER` it says so and is skipped. The top of `scripts/bench-compiler.js` says what each number
times, and how to set the number of runs and rounds.
