# Upgrading to 5.0

5.0 changes two things a 4.0 application may meet: compiled Cypher on SQLite needs a newer SQLite, and full-text
search is the shared compiler's, as compiling Cypher became in 4.0 ([Upgrading to 4.0](20-upgrading-to-4.md)). Some
exported API around search is renamed with it, which is why this is a major version.

## Breaking changes

### Compiled Cypher on SQLite needs SQLite 3.53.2

A Cypher statement on a SQLite store is refused, with a `DrivineError`, where the SQLite is older than
3.53.2: there a float it computes is written to 15 digits, 3.49 refuses a `CALL` that groups by a variable it imports,
and before 3.47 `last()` and a negative list index are refused. 4.0 compiled it there all the same. The SQLite is the
one Node bundles: Node 22.23.4, 24.19.0 and 26.4.0 are the first of their lines to bundle 3.53.2 or later. Plain SQL,
the schema manager and the object manager still run on SQLite 3.45 or later. See
[SQLite](07-supported-engines.md#sqlite).

### Full-text search is the shared compiler's

`loadMatching` on every store runs the shared compiler's full-text search, as drivine4j does: the query read,
BM25, each SQL store's ranked candidates and each graph engine's index call. On Neo4j, Memgraph and FalkorDB the
compiler is loaded on the first `loadMatching`. What changes is:

- **Oracle:** a full-text index Drivine for TypeScript 3.2 or earlier made, which its schema catalog records as
  `FULLTEXT`, is no longer searched through Oracle Text, and a search scores by BM25 over every node of the label.
  Make it again with `gom.indexes.recreate(spec)`.
- **Exports:** `fullTextIndexLimit` and `MEMGRAPH_TEXT_SEARCH_LIMIT_CAP` are removed, a `CypherGrammar` gives
  `searchStore` in place of `fullTextSearch`, a `GraphBackend`'s `searchIndexTable` is `vectorIndexTable` and
  `fullTextIndex`, and a `MatchingSearch` gives its `text` always, and `index` in place of `table`.
