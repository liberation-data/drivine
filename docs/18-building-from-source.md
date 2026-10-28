## Building from Source

```bash
npm install
npm run build
npm test         # starts a test container for each engine, needs Docker, and runs the suites in stages
```

The tests' datasources are in `.env.test`. Put overrides in `.env.test.local`, which git ignores: `USE_LOCAL_NEO4J=true`
(or `_MEMGRAPH`, `_FALKORDB`, `_POSTGRES`, `_ORACLE`) to use an instance of your own while you iterate, and
`ORACLE_TESTS=true` to run the Oracle suites too. See [TEST_CONTAINERS.md](../TEST_CONTAINERS.md).
