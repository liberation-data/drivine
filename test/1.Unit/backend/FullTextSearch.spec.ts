import {
    CypherBackend,
    DrivineError,
    FALKORDB_GRAMMAR,
    FullTextIndex,
    GraphBackend,
    MEMGRAPH_GRAMMAR,
    ModelRegistry,
    NEO4J_GRAMMAR,
    NodeFragment,
    NodeId,
    OracleBackend,
    OracleGraph,
    PostgresBackend,
    PostgresGraph,
    SqliteBackend,
    SqliteGraph,
    TargetModel
} from '@liberation-data/drivine';
import { fullTextIndexLookup, fullTextSearch, SearchIndex, SharedStore } from '@/cypher/SharedCypherCompiler';

@NodeFragment({ labels: ['Shelf', 'Stocked'] })
class Shelf {
    @NodeId() id: string;
    @FullTextIndex() title?: string;
}

/**
 * Full-text search is the shared module's (drivine-cypher-spec#100): each SQL store joins the module's ranked candidates
 * back to its node table for its own projection, and binds the module's parameters; each graph engine runs the module's
 * head before its own filters and projection. What the module writes is pinned there, by drivine4j's statements.
 */
describe('Full-text search from the shared module', () => {
    const shelf: TargetModel = { kind: 'NODE_FRAGMENT', model: new ModelRegistry().fragment(Shelf) };
    const search = (text: string, index?: SearchIndex) => ({
        label: 'Shelf',
        properties: ['title'],
        text,
        index,
        limit: 5
    });
    const graphs = { postgres: new PostgresGraph(), oracle: new OracleGraph(), sqlite: new SqliteGraph() };
    const stores: [SharedStore, GraphBackend, SearchIndex | undefined][] = [
        ['postgres', new PostgresBackend(graphs.postgres), undefined],
        ['postgres', new PostgresBackend(graphs.postgres), { trigram: true }],
        ['oracle', new OracleBackend(graphs.oracle), undefined],
        ['oracle', new OracleBackend(graphs.oracle), { oracleText: 'drivine_t_Shelftitle_1a2b3c' }],
        ['sqlite', new SqliteBackend(graphs.sqlite), undefined]
    ];

    it.each(stores)(
        'should join the module’s candidates on %s back to the node table, and bind its parameters (%#)',
        (store, backend, index) => {
            const planned = fullTextSearch(store, graphs[store].name, {
                labels: ['Shelf', 'Stocked'],
                properties: ['title'],
                query: 'graph -relational',
                index
            });
            const statement = backend.matching(shelf, search('graph -relational', index));
            expect(statement.text).toContain(
                `FROM (${planned.statement}) s JOIN ${graphs[store].nodes} n ON n.nid = s.nid`
            );
            expect(statement.bindings).toEqual(planned.parameters);
            expect(Object.keys(statement.bindings).every((it) => /^_cy_ft[0-9]+$/.test(it))).toBe(true);
        }
    );

    it('should narrow by the trigram index on Postgres only where it is made', () => {
        const backend = new PostgresBackend(graphs.postgres);
        expect(backend.matching(shelf, search('graph', { trigram: true })).text).toContain(' LIKE ');
        expect(backend.matching(shelf, search('graph')).text).not.toContain(' LIKE ');
    });

    it.each(stores)(
        'should throw the module’s refusal of a query with no word to look for on %s (%#)',
        (_, backend) => {
            expect(() => backend.matching(shelf, search('-only'))).toThrow(
                new DrivineError("A full-text query needs a word to look for: '-only' has none.")
            );
        }
    );

    it.each([NEO4J_GRAMMAR, MEMGRAPH_GRAMMAR, FALKORDB_GRAMMAR])(
        'should give the query to the index as it is on $engine, bound, ahead of the filters',
        (grammar) => {
            const statement = new CypherBackend(grammar).matching(shelf, search('-only'));
            expect(statement.bindings).toEqual({ _cy_ft1: '-only' });
            expect(statement.text.indexOf('$_cy_ft1')).toBeLessThan(statement.text.indexOf('MATCH (n) WHERE'));
            // The root's labels beyond the first are checked before the scale, so the index is asked for ten times as many.
            expect(statement.text).toContain(
                'WITH node, score WHERE node:`Shelf`:`Stocked`\nWITH node, score\nORDER BY score DESC\nLIMIT 50\n'
            );
        }
    );

    it.each([NEO4J_GRAMMAR, MEMGRAPH_GRAMMAR, FALKORDB_GRAMMAR])(
        'should write the index limit on $engine as a whole number in the statement, never bound, however large',
        (grammar) => {
            // A JS number goes over Bolt as a float, which the engines refuse as a LIMIT: so the limit is written, not bound.
            const statement = new CypherBackend(grammar).matching(shelf, { ...search('graph'), limit: 123_456_789 });
            expect(Object.keys(statement.bindings)).toEqual(['_cy_ft1']);
            const limits = [...statement.text.matchAll(/LIMIT (\S+)/g)].map((it) => it[1]);
            expect(limits.length).toBeGreaterThan(0);
            for (const limit of limits) expect(limit).toMatch(/^[0-9]+$/);
            // The index is asked for ten times the hits where the root has labels beyond the first: 1,234,567,890, whole.
            expect(statement.text).not.toMatch(/1234567890\.|1\.23456789/);
        }
    );

    it('should look the full-text index up in the catalog as the module does, on the stores that record it', () => {
        const postgres = new PostgresBackend(graphs.postgres).fullTextIndex('Shelf', ['title']);
        const lookup = fullTextIndexLookup('postgres', graphs.postgres.name, 'Shelf', ['title'])!;
        expect(postgres.statement.text).toEqual(lookup.statement);
        expect(postgres.statement.text).toContain(` FROM ${graphs.postgres.catalog} `);
        expect(postgres.statement.bindings).toEqual(lookup.parameters);
        expect(postgres.found([])).toEqual({ trigram: false });
        expect(postgres.found([{ dimensions: null }])).toEqual({ trigram: true });

        const oracle = new OracleBackend(graphs.oracle).fullTextIndex('Shelf', ['title']);
        expect(oracle.statement.text).toContain(` FROM ${graphs.oracle.catalog} `);
        expect(oracle.found([])).toEqual({});
        expect(oracle.found(['drivine_t_Shelftitle_1a2b3c'])).toEqual({ oracleText: 'drivine_t_Shelftitle_1a2b3c' });

        expect((new SqliteBackend(graphs.sqlite) as GraphBackend).fullTextIndex).toBeUndefined();
        expect(fullTextIndexLookup('sqlite', graphs.sqlite.name, 'Shelf', ['title'])).toBeUndefined();
    });
});
