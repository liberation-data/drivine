## Security

Values travel as bind parameters: filter values, saved properties, ids, search vectors and text. Names are written into
the query text, quoted for it: labels, relationship types and property names, which may come from data (a property
bag's keys, open `@NodeLabels`, a property named at runtime, `edges.relate`'s type). A backtick in a name is doubled in
either spelling: Neo4j reads `\u0060` as a backtick even between backticks, so that escape is doubled too. On Oracle
names are escaped for the JSON path and the SQL literal around it, and a graph's name must be letters, digits and
underscores. A raw `QuerySpecification`'s `skip` and `limit` must be whole numbers. Rows are never copied onto an
object under `__proto__`, `constructor` or `prototype`.

What stays yours to guard:

- **A `where` string** (raw Cypher or SQL) is written as it is. Put values in its parameters.
- **`loadMatching` on Neo4j** reads its text as Lucene, which takes wildcards and fuzzy terms that can be slow over a
  large index. Limit what users can send.
- **`matches()`** takes a regular expression: a user's value changes what it matches. Escape it for a literal match.
- **Transport security** is the connection's: on Neo4j and Memgraph use the protocol `bolt+s` or `neo4j+s`
  (`DATABASE_PROTOCOL`). FalkorDB's and Postgres's providers take no TLS options yet.
