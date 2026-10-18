import { MatchingSearch, NearestSearch } from '@/backend/GraphBackend';
import { GraphStatement } from '@/backend/GraphStatement';
import { hasLabels, jsonKey, nodeDocument, OracleGraph } from '@/backend/oracle/OracleGraph';
import { OracleViews } from '@/backend/oracle/OracleViews';
import { TargetModel } from '@/model/RelationshipModel';

/**
 * Vector and full-text search on Oracle, each as one statement returning `{value, score}` per hit, best first, as the
 * graph engines do: the index's candidates first, then the filters (threshold, `where`, a view's requirements), then
 * the trim.
 *
 * A vector search is exact: every node of the label with the property is ranked by VECTOR_DISTANCE, its score on
 * Neo4j's scale ((1 + cos) / 2 for cosine, 1 / (1 + d²) for euclidean). A full-text search counts how often each word
 * of the query occurs in the indexed properties, whole words, case aside, and scales by the best hit; the query is
 * words, not Lucene's language.
 */
export class OracleSearch {
    constructor(private readonly graph: OracleGraph) {}

    nearest(target: TargetModel, search: NearestSearch): GraphStatement {
        const value = `TO_VECTOR(JSON_SERIALIZE(JSON_QUERY(c.props, '$${jsonKey(search.property)}')))`;
        const metric = search.similarity === 'COSINE' ? 'COSINE' : 'EUCLIDEAN_SQUARED';
        const distance = `VECTOR_DISTANCE(${value}, TO_VECTOR($_vector), ${metric})`;
        const score = search.similarity === 'COSINE' ? `(2 - ${distance}) / 2` : `1 / (1 + ${distance})`;
        const candidates =
            `SELECT c.nid, ${score} AS score FROM ${this.graph.nodes} c WHERE ${hasLabels('c', [search.label])} ` +
            `AND JSON_EXISTS(c.props, '$${jsonKey(search.property)}') ORDER BY ${distance} FETCH FIRST ${
                search.k
            } ROWS ONLY`;
        return this.scored(target, candidates, search);
    }

    matching(target: TargetModel, search: MatchingSearch): GraphStatement {
        const text = search.properties
            .map((it) => `NVL(JSON_VALUE(c.props, '$${jsonKey(it)}' RETURNING CLOB), '')`)
            .join(` || ' ' || `);
        const occurrences = `REGEXP_COUNT(' ' || LOWER(${text}) || ' ', '[^[:alnum:]]' || t.word || '[^[:alnum:]]')`;
        const candidates = `SELECT nid, hit_count / MAX(hit_count) OVER () AS score FROM (
    SELECT c.nid, SUM(${occurrences}) AS hit_count
    FROM ${this.graph.nodes} c CROSS JOIN (
        SELECT DISTINCT LOWER(REGEXP_SUBSTR($_text, '[[:alnum:]]+', 1, LEVEL)) AS word FROM dual
        CONNECT BY REGEXP_SUBSTR($_text, '[[:alnum:]]+', 1, LEVEL) IS NOT NULL
    ) t
    WHERE ${hasLabels('c', [search.label])}
    GROUP BY c.nid
    HAVING SUM(${occurrences}) > 0
)`;
        return this.scored(target, candidates, search);
    }

    private scored(
        target: TargetModel,
        candidates: string,
        search: { where?: string; threshold?: boolean; limit?: number; depth?: Record<string, number> }
    ): GraphStatement {
        const root = target.kind === 'GRAPH_VIEW' ? target.model.root : target.model;
        const views = new OracleViews(this.graph, search.depth ?? {});
        const filters = [
            hasLabels('n', root.labels),
            ...(search.threshold ? ['s.score >= $_threshold'] : []),
            ...(search.where ? [`(${search.where})`] : []),
            ...(target.kind === 'GRAPH_VIEW' ? views.requirements(target.model, 'n') : [])
        ];
        const value = target.kind === 'GRAPH_VIEW' ? views.document(target.model, 'n') : nodeDocument('n');
        return new GraphStatement(
            [
                `SELECT JSON_OBJECT('value' VALUE ${value}, 'score' VALUE s.score RETURNING JSON) AS "result"`,
                `FROM (${candidates}) s JOIN ${this.graph.nodes} n ON n.nid = s.nid`,
                `WHERE ${filters.join(' AND ')}`,
                'ORDER BY s.score DESC',
                ...(search.limit !== undefined ? [`FETCH FIRST ${search.limit} ROWS ONLY`] : [])
            ].join('\n')
        );
    }
}
