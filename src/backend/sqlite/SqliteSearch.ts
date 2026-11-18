import { MatchingSearch, NearestSearch, searchedLabels } from '@/backend/GraphBackend';
import { GraphStatement } from '@/backend/GraphStatement';
import { hasLabels, jsonType, jsonValue, nodeDocument, path, SqliteGraph } from '@/backend/sqlite/SqliteGraph';
import { SqliteViews } from '@/backend/sqlite/SqliteViews';
import { DSL_ROW as ROW_ALIAS } from '@/backend/sqlite/SqliteQueryRenderer';
import { sqlText } from '@/backend/sql/SqlGraph';
import { fullTextSearch } from '@/cypher/SharedCypherCompiler';
import { TargetModel } from '@/model/RelationshipModel';

/**
 * Vector and full-text search on SQLite, each as one statement returning `{value, score}` per hit, best first, as the
 * graph engines do: the candidates first, then the filters (threshold, `where`, a view's requirements), then the trim.
 * A hit's row is the root's of a read of the query DSL, `n_`, which its `where` reads.
 *
 * SQLite has no vector index and a full-text index is not made yet, so a search measures every node it may find. A
 * vector search scores, by `drivine_similarity`, each node of the label that holds an embedding of the vector's size,
 * on Neo4j's scale: (1 + cos) / 2 for cosine, 1 / (1 + d²) for euclidean. A full-text search's candidates are the
 * shared module's (`fullTextSearch`): the core of Lucene's syntax, each term counted as a whole word by
 * `drivine_regexp_count` (see SqlitePatterns), as on Postgres and Oracle, its text lowered by `drivine_lower`, and scored
 * by BM25 as Neo4j's index scores it, by `drivine_math`, then scaled by the best hit.
 */
export class SqliteSearch {
    constructor(private readonly graph: SqliteGraph) {}

    nearest(target: TargetModel, search: NearestSearch): GraphStatement {
        const sized = search.dimensions
            ? ` AND json_array_length(c.props, ${path(search.property)}) = ${search.dimensions}`
            : '';
        const score =
            `drivine_similarity(${jsonValue('c', search.property)}, $_vector, ` + `${sqlText(search.similarity)})`;
        const candidates =
            `SELECT k.nid, k.score FROM (SELECT c.nid, ${score} AS score FROM ${this.graph.nodes} c ` +
            `WHERE ${hasLabels('c', [search.label])} AND ${jsonType('c', search.property)} = 'array'${sized}) k ` +
            `WHERE k.score IS NOT NULL ORDER BY k.score DESC, k.nid LIMIT ${search.k}`;
        return this.scored(target, candidates, search);
    }

    matching(target: TargetModel, search: MatchingSearch): GraphStatement {
        const ranked = fullTextSearch('sqlite', this.graph.name, {
            labels: searchedLabels(target, search.label),
            properties: search.properties,
            query: search.text
        });
        return this.scored(target, ranked.statement, search, ranked.parameters);
    }

    private scored(
        target: TargetModel,
        candidates: string,
        search: { where?: string; threshold?: boolean; limit?: number; depth?: Record<string, number> },
        bindings: Record<string, any> = {}
    ): GraphStatement {
        const root = target.kind === 'GRAPH_VIEW' ? target.model.root : target.model;
        const views = new SqliteViews(this.graph, search.depth ?? {});
        const filters = [
            hasLabels(ROW_ALIAS, root.labels),
            ...(search.threshold ? ['s.score >= $_threshold'] : []),
            ...(search.where ? [`(${search.where})`] : []),
            ...(target.kind === 'GRAPH_VIEW' ? views.requirements(target.model, ROW_ALIAS) : [])
        ];
        const value = target.kind === 'GRAPH_VIEW' ? views.document(target.model, ROW_ALIAS) : nodeDocument(ROW_ALIAS);
        return new GraphStatement(
            [
                `SELECT json_object('value', json(${value}), 'score', s.score) AS "result"`,
                `FROM (${candidates}) s JOIN ${this.graph.nodes} ${ROW_ALIAS} ON ${ROW_ALIAS}.nid = s.nid`,
                `WHERE ${filters.join(' AND ')}`,
                `ORDER BY s.score DESC, ${ROW_ALIAS}.nid`,
                ...(search.limit !== undefined ? [`LIMIT ${search.limit}`] : [])
            ].join('\n'),
            bindings
        );
    }
}
