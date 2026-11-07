import { MatchingSearch, NearestSearch } from '@/backend/GraphBackend';
import { GraphStatement } from '@/backend/GraphStatement';
import { hasLabels, jsonValue, nodeDocument, PostgresGraph, textOf } from '@/backend/postgres/PostgresGraph';
import { PostgresViews } from '@/backend/postgres/PostgresViews';
import { bm25Ranked } from '@/backend/sql/Bm25';
import { lookingAhead, TextQuery } from '@/backend/sql/TextQuery';
import { DrivineError } from '@/DrivineError';
import { TargetModel } from '@/model/RelationshipModel';

/**
 * Vector and full-text search on Postgres, each as one statement returning `{value, score}` per hit, best first, as the
 * graph engines do: the candidates first, then the filters (threshold, `where`, a view's requirements), then the trim.
 * drivine4j's statements: what one library's index serves, the other's search reads through it.
 *
 * A vector search is pgvector's: exact over every node of the label that holds an embedding of the vector's size, or
 * approximate through the label's HNSW index, which holds the embeddings of its size (see PostgresSchemaGrammar). It
 * scores on Neo4j's scale: (1 + cos) / 2 for cosine, 1 / (1 + d²) for euclidean. A full-text query is the core of
 * Lucene's syntax (see TextQuery), each term counted as a whole word as Oracle counts one without Oracle Text, scored
 * by BM25 as Neo4j's index scores it (see bm25Ranked), then scaled by the best hit; the trigram index of a full-text
 * index narrows it first to the nodes whose text holds a scoring term's words, which changes no score.
 */
export class PostgresSearch {
    constructor(private readonly graph: PostgresGraph) {}

    nearest(target: TargetModel, search: NearestSearch): GraphStatement {
        const operator = search.similarity === 'COSINE' ? '<=>' : '<->';
        const score = (distance: string): string =>
            search.similarity === 'COSINE' ? `(2 - (${distance})) / 2` : `1 / (1 + (${distance}) * (${distance}))`;
        const indexed = search.table !== undefined ? Number(search.table) : undefined;
        if (indexed !== undefined && indexed === search.dimensions) {
            // Through the index: the embedding read as the index reads it, among the nodes it holds.
            const distance = `${embedding('s', search.property, indexed)} ${operator} ${vector(indexed)}`;
            const candidates =
                `SELECT k.nid, ${score('k.distance')} AS score FROM (SELECT s.nid, ${distance} AS distance ` +
                `FROM ${this.graph.nodes} s WHERE ${hasLabels('s', [search.label])} AND ${holds(
                    's',
                    search.property,
                    indexed
                )} ` +
                `ORDER BY distance LIMIT ${search.k}) k`;
            return this.scored(target, candidates, search);
        }
        const distance = `${embedding('c', search.property)} ${operator} ${vector()}`;
        const candidates = `SELECT c.nid, ${score(distance)} AS score FROM ${this.graph.nodes} c WHERE ${hasLabels(
            'c',
            [search.label]
        )} AND ${holds('c', search.property, search.dimensions)} ORDER BY score DESC, c.nid LIMIT ${search.k}`;
        return this.scored(target, candidates, search);
    }

    matching(target: TargetModel, search: MatchingSearch): GraphStatement {
        if (search.text === undefined) {
            throw new DrivineError('A full-text search on Postgres is written with its text.');
        }
        const query = TextQuery.parse(search.text);
        const bindings: Record<string, any> = {};
        const bind = (value: string): string => {
            const name = `_term${Object.keys(bindings).length}`;
            bindings[name] = value;
            return `CAST($${name} AS text)`;
        };
        const text = searchedText('c', search.properties);
        // A node that matches a term holds each of its words: what the trigram index answers is whether it holds them.
        const narrowed = search.table
            ? [
                  `(${query.scoredWords
                      .map(
                          (words) => `(${words.map((it) => `${text} LIKE ${bind(`%${likeText(it)}%`)}`).join(' AND ')})`
                      )
                      .join(' OR ')})`
              ]
            : [];
        // Narrowed by the root's every label before the scale, so the best of it is a hit the search can return.
        const root = target.kind === 'GRAPH_VIEW' ? target.model.root : target.model;
        const labels = [search.label, ...root.labels.filter((it) => it !== search.label)];
        const len = `length(${joinedText('c', search.properties)})`;
        const candidates = bm25Ranked(
            `SELECT c.nid, ${text} AS text, ${len} AS len FROM ${this.graph.nodes} c WHERE ${[
                hasLabels('c', labels),
                ...narrowed
            ].join(' AND ')}`,
            `SELECT ${len} AS len FROM ${this.graph.nodes} c WHERE ${hasLabels('c', labels)}`,
            query,
            {
                count: (text, term) =>
                    `(SELECT count(*) FROM regexp_matches(${text}, ${bind(lookingAhead(term))}, 'g'))`,
                holds: (text, term) => `${text} ~ ${bind(term)}`,
                ln: (value) => `ln(${value})`,
                real: (value) => `CAST(${value} AS double precision)`
            }
        );
        return this.scored(target, candidates, search, bindings);
    }

    private scored(
        target: TargetModel,
        candidates: string,
        search: { where?: string; threshold?: boolean; limit?: number; depth?: Record<string, number> },
        bindings: Record<string, any> = {}
    ): GraphStatement {
        const root = target.kind === 'GRAPH_VIEW' ? target.model.root : target.model;
        const views = new PostgresViews(this.graph, search.depth ?? {});
        const filters = [
            hasLabels('n', root.labels),
            ...(search.threshold ? ['s.score >= $_threshold'] : []),
            ...(search.where ? [`(${search.where})`] : []),
            ...(target.kind === 'GRAPH_VIEW' ? views.requirements(target.model, 'n') : [])
        ];
        const value = target.kind === 'GRAPH_VIEW' ? views.document(target.model, 'n') : nodeDocument('n');
        return new GraphStatement(
            [
                `SELECT jsonb_build_object('value', ${value}, 'score', s.score) AS "result"`,
                `FROM (${candidates}) s JOIN ${this.graph.nodes} n ON n.nid = s.nid`,
                `WHERE ${filters.join(' AND ')}`,
                'ORDER BY s.score DESC, n.nid',
                ...(search.limit !== undefined ? [`FETCH FIRST ${search.limit} ROWS ONLY`] : [])
            ].join('\n'),
            bindings
        );
    }
}

/**
 * The embedding stored under the property of the row `alias` as a pgvector `vector`: the JSON array's text, which is
 * the text pgvector reads a vector from. Of `dimensions` when given, as an index over it is made, so a statement that
 * reads it so is answered by the index.
 */
export function embedding(alias: string, property: string, dimensions?: number): string {
    return `CAST(CAST(${jsonValue(alias, property)} AS text) AS vector${dimensions ? `(${dimensions})` : ''})`;
}

/**
 * Whether the row `alias` holds an embedding under the property, of `dimensions` where given: a search measures only
 * those, as pgvector refuses to measure vectors of two sizes, and a vector index holds only those.
 */
export function holds(alias: string, property: string, dimensions?: number): string {
    const value = jsonValue(alias, property);
    return `jsonb_typeof(${value}) = 'array'${dimensions ? ` AND jsonb_array_length(${value}) = ${dimensions}` : ''}`;
}

/**
 * The text a full-text search reads of the row `alias`: its properties, each as text, a space between them, in lower
 * case. The expression of a full-text index too (with an empty alias), so a statement that reads it so is answered by
 * the index.
 */
export function searchedText(alias: string, properties: string[]): string {
    return `lower(${joinedText(alias, properties)})`;
}

/** `searchedText` before it is lowered: what a full-text search measures a text's length by (drivine4j#604). */
export function joinedText(alias: string, properties: string[]): string {
    return properties.map((it) => `COALESCE(${textOf(alias, it)}, '')`).join(` || ' ' || `);
}

/** The vector bound as `$_vector`, a list of numbers, as pgvector's: of `dimensions` where given. */
function vector(dimensions?: number): string {
    return `CAST(CAST($_vector AS float8[]) AS vector${dimensions ? `(${dimensions})` : ''})`;
}

/** A word as text a `LIKE` pattern matches as it is: its own `%`, `_` and backslash taken as themselves. */
function likeText(word: string): string {
    return word.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
