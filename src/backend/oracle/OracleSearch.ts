import { MatchingSearch, NearestSearch, searchedLabels } from '@/backend/GraphBackend';
import { GraphStatement } from '@/backend/GraphStatement';
import { hasLabels, jsonKey, nodeDocument, OracleGraph, sameKey } from '@/backend/oracle/OracleGraph';
import { OracleViews } from '@/backend/oracle/OracleViews';
import { called, hinted } from '@/backend/oracle/OracleFragments';
import { DSL_ROW as ROW_ALIAS } from '@/backend/sql/FragmentQueryRenderer';
import { TargetModel } from '@/model/RelationshipModel';
import { fullTextSearch } from '@/cypher/SharedCypherCompiler';

/**
 * Vector and full-text search on Oracle, each as one statement returning `{value, score}` per hit, best first, as the
 * graph engines do: the index's candidates first, then the filters (threshold, `where`, a view's requirements), then
 * the trim.
 *
 * Each goes through the index made for it (a table beside the nodes, see OracleSchemaGrammar) where there is one, and
 * otherwise reads every node of the label. A vector search goes through an index made for embeddings of the vector's
 * size only, and without one measures only the embeddings of that size: Oracle refuses to measure two sizes against
 * each other. It scores on Neo4j's scale ((1 + cos) / 2 for cosine, 1 / (1 + d²) for euclidean): approximate through
 * the index, exact without. A full-text search's candidates are the shared module's (`fullTextSearch`), its query the
 * core of Lucene's syntax: Oracle Text scores through the index, each property's score added, and sees only what has
 * been committed; without one, each term is counted as a whole word and the counts scored by BM25, as Neo4j's index
 * scores them. Either is scaled by the best hit. A hit's row is the root's of a read of the query DSL, `n_`, which its
 * `where` reads, joined back by the keys Oracle keeps ({@link sameKey}), with the hints the DSL's fragments in it ask
 * for (see OracleFragments).
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
        // Every node of the label that holds an embedding of the vector's size (ORA-51808 for any other), so a node of
        // another size is left out, as the other stores leave it out.
        const value = `TO_VECTOR(JSON_SERIALIZE(JSON_QUERY(c.props, '$${jsonKey(search.property)}')))`;
        const distance = `VECTOR_DISTANCE(${value}, TO_VECTOR($_vector), ${metric})`;
        const held = [
            hasLabels('c', [search.label]),
            `JSON_EXISTS(c.props, '$${jsonKey(search.property)}')`,
            ...(search.dimensions !== undefined ? [`VECTOR_DIMENSION_COUNT(${value}) = ${search.dimensions}`] : [])
        ];
        const candidates =
            `SELECT c.nid, ${score(distance)} AS score FROM ${this.graph.nodes} c WHERE ${held.join(' AND ')} ` +
            `ORDER BY ${distance} FETCH FIRST ${search.k} ROWS ONLY`;
        return this.scored(target, candidates, search);
    }

    matching(target: TargetModel, search: MatchingSearch): GraphStatement {
        const ranked = fullTextSearch('oracle', this.graph.name, {
            labels: searchedLabels(target, search.label),
            properties: search.properties,
            query: search.text,
            index: search.index
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
        const views = new OracleViews(this.graph, search.depth ?? {});
        const filters = [
            hasLabels(ROW_ALIAS, root.labels),
            ...(search.threshold ? ['s.score >= $_threshold'] : []),
            ...(search.where ? [`(${search.where})`] : []),
            ...(target.kind === 'GRAPH_VIEW' ? views.requirements(target.model, ROW_ALIAS) : [])
        ];
        const value = target.kind === 'GRAPH_VIEW' ? views.document(target.model, ROW_ALIAS) : nodeDocument(ROW_ALIAS);
        const made = called(
            hinted(
                [
                    `SELECT JSON_OBJECT('value' VALUE ${value}, 'score' VALUE s.score RETURNING JSON) AS "result"`,
                    `FROM (${candidates}) s JOIN ${this.graph.nodes} ${ROW_ALIAS} ON ${sameKey(
                        `${ROW_ALIAS}.nid`,
                        's.nid'
                    )}`,
                    `WHERE ${filters.join(' AND ')}`,
                    'ORDER BY s.score DESC',
                    ...(search.limit !== undefined ? [`FETCH FIRST ${search.limit} ROWS ONLY`] : [])
                ].join('\n'),
                views.fragments.hints
            ),
            this.graph.name,
            views.fragments
        );
        return new GraphStatement(made.text, { ...bindings, ...views.fragments.parameters }, made.calls);
    }
}
