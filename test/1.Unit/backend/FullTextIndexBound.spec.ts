import {
    CypherBackend,
    Direction,
    FALKORDB_GRAMMAR,
    FULL_TEXT_FILTERED_OVER_FETCH,
    FULL_TEXT_INDEX_LIMIT_CEILING,
    fullTextIndexLimit,
    FullTextIndex,
    GraphPath,
    GraphRelationship,
    GraphView,
    hop,
    MEMGRAPH_GRAMMAR,
    MEMGRAPH_TEXT_SEARCH_LIMIT_CAP,
    MatchingSearch,
    ModelRegistry,
    NEO4J_GRAMMAR,
    NodeFragment,
    NodeId,
    OracleBackend,
    OracleGraph,
    PostgresBackend,
    PostgresGraph,
    Root,
    TargetModel
} from '@liberation-data/drivine';

@NodeFragment({ labels: ['Article'] })
class Article {
    @NodeId() id: string;
    @FullTextIndex() body?: string;
}

/** A fragment of two labels: the index is over the first, so a hit without the second is dropped after it. */
@NodeFragment({ labels: ['Article', 'Reviewed'] })
class ReviewedArticle {
    @NodeId() id: string;
    @FullTextIndex() body?: string;
}

@NodeFragment({ labels: ['Author'] })
class Author {
    @NodeId() id: string;
}

/** A view rooted on a fragment of two labels. */
@GraphView()
class ReviewedArticleWithAuthors {
    @Root() article: ReviewedArticle;
    @GraphRelationship({ type: 'WROTE', direction: Direction.INCOMING, target: () => Author }) authors: Author[];
}

/** A view with no required relationship: nothing drops a hit after the index. */
@GraphView()
class ArticleWithAuthors {
    @Root() article: Article;
    @GraphRelationship({ type: 'WROTE', direction: Direction.INCOMING, target: () => Author }) authors: Author[];
}

/** A view whose required relationship drops the hits that have no author. */
@GraphView()
class AuthoredArticle {
    @Root() article: Article;
    @GraphRelationship({ type: 'WROTE', direction: Direction.INCOMING, target: () => Author, required: true })
    author: Author;
}

/** A view whose required path drops the hits that no editor reviewed. */
@GraphView()
class EditedArticle {
    @Root() article: Article;
    @GraphPath([hop('WROTE', Direction.INCOMING), hop('REVIEWED_BY')], { target: () => Author, required: true })
    editors: Author[];
}

/**
 * A full-text search is bounded where the index yields, not only where the rows are returned. Every hit is collected
 * to scale the scores, and each row after carries the collection, so the number of hits, not the limit, is what a
 * search costs; a common word matches most of a corpus (liberation-data/drivine#296).
 */
describe('A full-text search’s index bound', () => {
    const registry = new ModelRegistry();
    const neo4j = new CypherBackend(NEO4J_GRAMMAR);
    const engines = [neo4j, new CypherBackend(MEMGRAPH_GRAMMAR), new CypherBackend(FALKORDB_GRAMMAR)];
    const fragment: TargetModel = { kind: 'NODE_FRAGMENT', model: registry.fragment(Article) };
    const unauthored: TargetModel = { kind: 'GRAPH_VIEW', model: registry.view(ArticleWithAuthors) };
    const authored: TargetModel = { kind: 'GRAPH_VIEW', model: registry.view(AuthoredArticle) };
    const search = (more: Partial<MatchingSearch> = {}): MatchingSearch => ({
        label: 'Article',
        properties: ['body'],
        limit: 8,
        ...more
    });
    /** The limit the head cuts the hits to, read off the statement. */
    const cutTo = (text: string): number => Number(/ORDER BY score DESC\nLIMIT (\d+)\n/.exec(text)![1]);

    it('should ask Neo4j’s index call for a limit', () => {
        expect(neo4j.matching(fragment, search()).text).toContain(
            "CALL db.index.fulltext.queryNodes('Article_body_fulltext', $_text, {limit: 8}) YIELD node, score"
        );
    });

    it('should ask Memgraph’s index call for a limit, since without one it yields only 1,000 hits', () => {
        const memgraph = new CypherBackend(MEMGRAPH_GRAMMAR);
        expect(memgraph.matching(fragment, search({ limit: 1_100 })).text).toContain(
            "CALL text_search.search_all('Article_body_fulltext', $_text, {limit: 1100}) YIELD node, score"
        );
    });

    it('should ask Memgraph’s index for no more than its cap, since a far larger limit aborts the server', () => {
        const memgraph = new CypherBackend(MEMGRAPH_GRAMMAR);
        const text = memgraph.matching(fragment, search({ limit: Number.MAX_SAFE_INTEGER })).text;
        expect(text).toContain(`$_text, {limit: ${MEMGRAPH_TEXT_SEARCH_LIMIT_CAP}}) YIELD node, score`);
        expect(MEMGRAPH_TEXT_SEARCH_LIMIT_CAP).toEqual(1_000_000);
    });

    it('should give FalkorDB’s index call no limit, since it takes none', () => {
        const text = new CypherBackend(FALKORDB_GRAMMAR).matching(fragment, search()).text;
        expect(text).toContain("CALL db.idx.fulltext.queryNodes('Article', $_text) YIELD node, score\n");
    });

    it.each(engines.map((it) => [it.grammar.engine, it]))(
        'should cut the hits to the best before collecting them on %s',
        (_engine, backend) => {
            const text = (backend as CypherBackend).matching(fragment, search()).text;
            const cut = text.indexOf(
                'YIELD node, score\nWITH node, score\nORDER BY score DESC\nLIMIT 8\nWITH collect('
            );
            expect(cut).toBeGreaterThan(0);
            expect(text.indexOf('collect(')).toBeGreaterThan(cut);
        }
    );

    it('should ask the index for exactly the limit where nothing drops a hit after it', () => {
        // A threshold keeps the best hits, as the cut does.
        expect(cutTo(neo4j.matching(fragment, search({ threshold: true })).text)).toEqual(8);
        expect(cutTo(neo4j.matching(unauthored, search()).text)).toEqual(8);
        expect(cutTo(neo4j.matching(fragment, search({ where: '' })).text)).toEqual(8);
    });

    it('should over-fetch by the stated factor where a caller’s where filters the hits', () => {
        expect(FULL_TEXT_FILTERED_OVER_FETCH).toEqual(10);
        const text = neo4j.matching(fragment, search({ where: 'n.title = $t' })).text;
        expect(cutTo(text)).toEqual(80);
        expect(text).toContain('{limit: 80}');
    });

    it('should over-fetch for a view’s required relationship alone', () => {
        expect(cutTo(neo4j.matching(authored, search()).text)).toEqual(80);
        expect(cutTo(neo4j.matching(unauthored, search({ where: 'n.title = $t' })).text)).toEqual(80);
    });

    it('should over-fetch for a view’s required path alone', () => {
        const edited: TargetModel = { kind: 'GRAPH_VIEW', model: registry.view(EditedArticle) };
        expect(cutTo(neo4j.matching(edited, search()).text)).toEqual(80);
    });

    it('should over-fetch for a fragment whose labels beyond the first drop the hits without them', () => {
        const reviewed: TargetModel = { kind: 'NODE_FRAGMENT', model: registry.fragment(ReviewedArticle) };
        expect(cutTo(neo4j.matching(reviewed, search()).text)).toEqual(80);
    });

    it.each(engines.map((it) => [it.grammar.engine, it]))(
        'should check a root’s every label before cutting and scaling the hits on %s (liberation-data/drivine#307)',
        (_engine, backend) => {
            const engine = backend as CypherBackend;
            const check =
                'YIELD node, score\nWITH node, score WHERE node:Article:Reviewed\nWITH node, score\nORDER BY score DESC\nLIMIT 80\n';
            for (const target of [
                { kind: 'NODE_FRAGMENT', model: registry.fragment(ReviewedArticle) },
                { kind: 'GRAPH_VIEW', model: registry.view(ReviewedArticleWithAuthors) }
            ] as TargetModel[]) {
                const text = engine.matching(target, search()).text;
                expect(text).toContain(check);
                expect(text.indexOf(check)).toBeLessThan(text.indexOf('collect('));
            }
            expect(engine.matching(fragment, search()).text).not.toContain('WHERE node:');
        }
    );

    it.each([
        ['Postgres', new PostgresBackend(new PostgresGraph()), undefined, 'c.labels @> \'["Reviewed"]\''],
        ['Oracle', new OracleBackend(new OracleGraph()), undefined, ',"Reviewed",'],
        ['Oracle Text', new OracleBackend(new OracleGraph()), 'drivine_t_Article', ',"Reviewed",']
    ])(
        'should check a root’s every label before scaling the hits on %s (liberation-data/drivine#307)',
        (_store, backend, table, second) => {
            for (const target of [
                { kind: 'NODE_FRAGMENT', model: registry.fragment(ReviewedArticle) },
                { kind: 'GRAPH_VIEW', model: registry.view(ReviewedArticleWithAuthors) }
            ] as TargetModel[]) {
                const text = backend.matching(target, search({ text: 'graph', table })).text;
                // The hits the scale's MAX() OVER () is taken over, before they are joined to the nodes returned.
                const scaled = text.slice(text.indexOf('OVER ()'), text.indexOf(') s JOIN'));
                expect(scaled).toContain(second);
            }
        }
    );

    it('should clamp the over-fetch, and ask for no more than the ceiling however large the limit', () => {
        expect(fullTextIndexLimit(Number.MAX_SAFE_INTEGER, true)).toEqual(FULL_TEXT_INDEX_LIMIT_CEILING);
        expect(fullTextIndexLimit(Number.MAX_SAFE_INTEGER, false)).toEqual(FULL_TEXT_INDEX_LIMIT_CEILING);
        expect(fullTextIndexLimit(FULL_TEXT_INDEX_LIMIT_CEILING / 10, true)).toEqual(FULL_TEXT_INDEX_LIMIT_CEILING);
        expect(fullTextIndexLimit(3, true)).toEqual(30);
        const text = neo4j.matching(fragment, search({ limit: Number.MAX_SAFE_INTEGER, where: 'n.x = 1' })).text;
        expect(text).toContain('{limit: 2147483647}');
        expect(text).toContain(`LIMIT ${Number.MAX_SAFE_INTEGER}\nRETURN`);
    });

    it('should project a fragment only for the rows it returns, limiting them without a second sort', () => {
        // The head yields its rows best first. A sort between the filter and the limit would hold each surviving row,
        // and each carries the hits the head collected.
        const text = neo4j.matching(fragment, search({ where: 'n.title = $t' })).text;
        const tail = text.substring(text.indexOf('UNWIND _hits AS _hit'));
        expect(tail).toContain(
            'MATCH (n) WHERE n:Article AND (n.title = $t)\nWITH n, _score\nLIMIT 8\nRETURN {value: '
        );
        expect(tail.indexOf('LIMIT 8')).toBeLessThan(tail.indexOf('properties(n)'));
        expect(tail.match(/ORDER BY/g)).toHaveLength(1);
        expect(tail.endsWith('ORDER BY result.score DESC')).toBe(true);
    });

    it('should keep a view’s limit after its projection', () => {
        expect(neo4j.matching(authored, search()).text).toMatch(/ORDER BY result\.score DESC\nLIMIT 8$/);
    });
});
