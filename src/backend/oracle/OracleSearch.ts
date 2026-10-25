import { MatchingSearch, NearestSearch } from '@/backend/GraphBackend';
import { GraphStatement } from '@/backend/GraphStatement';
import { hasLabels, jsonKey, nodeDocument, OracleGraph } from '@/backend/oracle/OracleGraph';
import { OracleViews } from '@/backend/oracle/OracleViews';
import { TargetModel } from '@/model/RelationshipModel';
import { DrivineError } from '@/DrivineError';
import { TextQuery } from '@/backend/sql/TextQuery';

/**
 * Vector and full-text search on Oracle, each as one statement returning `{value, score}` per hit, best first, as the
 * graph engines do: the index's candidates first, then the filters (threshold, `where`, a view's requirements), then
 * the trim.
 *
 * Each goes through the index made for it (a table beside the nodes, see OracleSchemaGrammar) where there is one, and
 * otherwise reads every node of the label. A vector search scores on Neo4j's scale ((1 + cos) / 2 for cosine,
 * 1 / (1 + d²) for euclidean): approximate through the index, exact without. A full-text query is the core of Lucene's
 * syntax (see TextQuery): Oracle Text scores through the index; without one, how often each term occurs as whole
 * words. Either is scaled by the best hit.
 */
export class OracleSearch {
    constructor(private readonly graph: OracleGraph) {}

    nearest(target: TargetModel, search: NearestSearch): GraphStatement {
        const metric = search.similarity === 'COSINE' ? 'COSINE' : 'EUCLIDEAN_SQUARED';
        const score = (distance: string): string =>
            search.similarity === 'COSINE' ? `(2 - ${distance}) / 2` : `1 / (1 + ${distance})`;
        if (search.table) {
            // Through the index: its nearest, approximately, then tested for the root's labels as any hit is.
            const distance = `VECTOR_DISTANCE(v.embedding, TO_VECTOR($_vector), ${metric})`;
            const candidates =
                `SELECT k.nid, ${score('k.distance')} AS score FROM (SELECT v.nid, ${distance} AS distance FROM ${
                    search.table
                } v ` + `ORDER BY distance FETCH APPROX FIRST ${search.k} ROWS ONLY) k`;
            return this.scored(target, candidates, search);
        }
        const value = `TO_VECTOR(JSON_SERIALIZE(JSON_QUERY(c.props, '$${jsonKey(search.property)}')))`;
        const distance = `VECTOR_DISTANCE(${value}, TO_VECTOR($_vector), ${metric})`;
        const candidates =
            `SELECT c.nid, ${score(distance)} AS score FROM ${this.graph.nodes} c WHERE ${hasLabels('c', [
                search.label
            ])} ` +
            `AND JSON_EXISTS(c.props, '$${jsonKey(search.property)}') ORDER BY ${distance} FETCH FIRST ${
                search.k
            } ROWS ONLY`;
        return this.scored(target, candidates, search);
    }

    matching(target: TargetModel, search: MatchingSearch): GraphStatement {
        if (search.text === undefined) {
            throw new DrivineError('A full-text search on Oracle is written with its text.');
        }
        const query = TextQuery.parse(search.text);
        const bindings: Record<string, any> = {};
        const bind = (value: string): string => {
            const name = `_term${Object.keys(bindings).length}`;
            bindings[name] = value;
            return `$${name}`;
        };
        // Narrowed by the root's every label before the scale, so the best of it is a hit the search can return.
        const root = target.kind === 'GRAPH_VIEW' ? target.model.root : target.model;
        const labels = [search.label, ...root.labels.filter((it) => it !== search.label)];
        if (search.table) {
            // Through Oracle Text: each property's score added, then scaled by the best. The index holds what has been
            // committed, so a search does not see what its own transaction wrote.
            const text = bind(query.oracleText);
            const contains = search.properties.map(
                (it, i) => `JSON_TEXTCONTAINS(t.doc, '$${jsonKey(it)}', ${text}, ${i + 1})`
            );
            const scores = search.properties.map((_, i) => `SCORE(${i + 1})`).join(' + ');
            const matched =
                labels.length > 1
                    ? `(${contains.join(' OR ')}) AND t.nid IN (SELECT c.nid FROM ${
                          this.graph.nodes
                      } c WHERE ${hasLabels('c', labels)})`
                    : contains.join(' OR ');
            const candidates =
                `SELECT nid, hit_count / MAX(hit_count) OVER () AS score FROM (SELECT t.nid, ${scores} AS hit_count ` +
                `FROM ${search.table} t WHERE ${matched}) WHERE hit_count > 0`;
            return this.scored(target, candidates, search, bindings);
        }
        // Every node of the label: how often the query's terms occur as whole words in its lower-cased text, each term
        // bound on its own (one bound list named twice gave wrong counts on 23.26, drivine4j found).
        const text = search.properties
            .map((it) => `LOWER(NVL(JSON_VALUE(c.props, '$${jsonKey(it)}' RETURNING CLOB), ''))`)
            .join(` || ' ' || `);
        const count = (pattern: string): string => `REGEXP_COUNT(x.text, ${bind(pattern)})`;
        const occurrences = query.scored.map(count).join(' + ');
        const conditions = [
            ...query.required.map((it) => `${count(it)} > 0`),
            ...query.excluded.map((it) => `${count(it)} = 0`)
        ];
        const candidates = `SELECT nid, hit_count / MAX(hit_count) OVER () AS score FROM (
    SELECT x.nid, ${occurrences} AS hit_count
    FROM (SELECT c.nid, ${text} AS text FROM ${this.graph.nodes} c WHERE ${hasLabels('c', labels)}) x
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
) WHERE hit_count > 0`;
        return this.scored(target, candidates, search, bindings);
    }

    private scored(
        target: TargetModel,
        candidates: string,
        search: { where?: string; threshold?: boolean; limit?: number; depth?: Record<string, number> },
        bindings: Record<string, any> = {}
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
            ].join('\n'),
            bindings
        );
    }
}
