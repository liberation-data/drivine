import { MatchingSearch, NearestSearch } from '@/backend/GraphBackend';
import { GraphStatement } from '@/backend/GraphStatement';
import {
    hasLabels,
    jsonType,
    jsonValue,
    nodeDocument,
    path,
    SqliteGraph,
    textOf
} from '@/backend/sqlite/SqliteGraph';
import { SqliteViews } from '@/backend/sqlite/SqliteViews';
import { sqlText } from '@/backend/sql/SqlGraph';
import { TextQuery } from '@/backend/sql/TextQuery';
import { DrivineError } from '@/DrivineError';
import { TargetModel } from '@/model/RelationshipModel';

/**
 * Vector and full-text search on SQLite, each as one statement returning `{value, score}` per hit, best first, as the
 * graph engines do: the candidates first, then the filters (threshold, `where`, a view's requirements), then the trim.
 *
 * SQLite has no vector index and a full-text index is not made yet, so a search measures every node it may find. A
 * vector search scores, by `drivine_similarity`, each node of the label that holds an embedding of the vector's size,
 * on Neo4j's scale: (1 + cos) / 2 for cosine, 1 / (1 + d²) for euclidean. A full-text query is the core of Lucene's
 * syntax (see TextQuery), scored by how often its terms occur as whole words, as on Postgres and Oracle, by
 * `drivine_regexp_count`, then scaled by the best hit.
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
        if (search.text === undefined) {
            throw new DrivineError('A full-text search on SQLite is written with its text.');
        }
        const query = TextQuery.parse(search.text);
        const bindings: Record<string, any> = {};
        const bind = (value: string): string => {
            const name = `_term${Object.keys(bindings).length}`;
            bindings[name] = value;
            return `CAST($${name} AS TEXT)`;
        };
        const count = (pattern: string): string => `drivine_regexp_count(x.text, ${bind(pattern)})`;
        const occurrences = query.scored.map(count).join(' + ');
        const conditions = [
            ...query.required.map((it) => `${count(it)} > 0`),
            ...query.excluded.map((it) => `${count(it)} = 0`)
        ];
        // Narrowed by the root's every label before the scale, so the best of it is a hit the search can return.
        const root = target.kind === 'GRAPH_VIEW' ? target.model.root : target.model;
        const labels = [search.label, ...root.labels.filter((it) => it !== search.label)];
        const candidates =
            `SELECT h.nid, CAST(h.hit_count AS REAL) / MAX(h.hit_count) OVER () AS score FROM (` +
            `SELECT x.nid, ${occurrences} AS hit_count FROM (SELECT c.nid, ${searchedText(
                'c',
                search.properties
            )} AS text FROM ${this.graph.nodes} c WHERE ${hasLabels('c', labels)}) x` +
            `${conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''}) h WHERE h.hit_count > 0`;
        return this.scored(target, candidates, search, bindings);
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
            hasLabels('n', root.labels),
            ...(search.threshold ? ['s.score >= $_threshold'] : []),
            ...(search.where ? [`(${search.where})`] : []),
            ...(target.kind === 'GRAPH_VIEW' ? views.requirements(target.model, 'n') : [])
        ];
        const value = target.kind === 'GRAPH_VIEW' ? views.document(target.model, 'n') : nodeDocument('n');
        return new GraphStatement(
            [
                `SELECT json_object('value', json(${value}), 'score', s.score) AS "result"`,
                `FROM (${candidates}) s JOIN ${this.graph.nodes} n ON n.nid = s.nid`,
                `WHERE ${filters.join(' AND ')}`,
                'ORDER BY s.score DESC, n.nid',
                ...(search.limit !== undefined ? [`LIMIT ${search.limit}`] : [])
            ].join('\n'),
            bindings
        );
    }
}

/**
 * The text a full-text search reads of the row `alias`: its properties, each as text, a space between them, in lower
 * case, by `drivine_lower`: SQLite's own `lower` lowers only ASCII.
 */
export function searchedText(alias: string, properties: string[]): string {
    return `drivine_lower(${properties.map((it) => `COALESCE(${textOf(alias, it)}, '')`).join(` || ' ' || `)})`;
}
