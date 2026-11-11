/**
 * The shared compiler is loaded on the first compile for a SQL store, and by an application on a graph engine alone only
 * for a full-text search (#685): the package, and its Wasm module, are required by `SharedCypherCompiler` on its first
 * `compile` or full-text search, and by nothing else in Drivine.
 */
describe('Loading the shared compiler', () => {
    const PACKAGE = '@liberation-data/drivine-cypher-compiler';

    it('should not load it for the package and a statement run on Neo4j, and should for a SQL store', async () => {
        await jest.isolateModulesAsync(async () => {
            const required = jest.fn();
            jest.doMock(PACKAGE, () => {
                required();
                return jest.requireActual(PACKAGE);
            });
            // The whole package, as an application imports it, and a statement run on a Neo4j connection.
            await import('@/index');
            const neo4jConnection: typeof import('@/connection/neo4j/Neo4jConnection') = await import(
                '@/connection/neo4j/Neo4jConnection'
            );
            const querySpecification: typeof import('@/query/QuerySpecification') = await import(
                '@/query/QuerySpecification'
            );
            const run = jest.fn(async () => Promise.resolve({ records: [] }));
            const connection = new neo4jConnection.Neo4jConnection(
                { run, close: jest.fn() } as any,
                { mapQueryResults: (rows: any[]) => rows } as any
            );
            await connection.query(
                new querySpecification.QuerySpecification({ text: 'RETURN 1 AS x', language: 'CYPHER' })
            );
            expect(run).toHaveBeenCalled();

            const shared: typeof import('@/cypher/SharedCypherCompiler') = await import(
                '@/cypher/SharedCypherCompiler'
            );
            expect(shared.sharedCompilerLoaded()).toBe(false);
            expect(required).not.toHaveBeenCalled();

            new shared.SharedCypherCompiler('sqlite', { name: 'g' }).compile('RETURN 1 AS x');
            expect(shared.sharedCompilerLoaded()).toBe(true);
            expect(required).toHaveBeenCalledTimes(1);
        });
    });

    it('should load it on a graph engine for its first full-text search, which the module writes', async () => {
        await jest.isolateModulesAsync(async () => {
            const required = jest.fn();
            jest.doMock(PACKAGE, () => {
                required();
                return jest.requireActual(PACKAGE);
            });
            const drivine: typeof import('@/index') = await import('@/index');
            const shared: typeof import('@/cypher/SharedCypherCompiler') = await import(
                '@/cypher/SharedCypherCompiler'
            );
            class Doc {
                id: string;
                body?: string;
            }
            drivine.NodeId()(Doc.prototype, 'id');
            drivine.FullTextIndex()(Doc.prototype, 'body');
            drivine.NodeFragment({ labels: ['Doc'] })(Doc);
            const backend = new drivine.CypherBackend(drivine.NEO4J_GRAMMAR);
            const target: import('@/model/RelationshipModel').TargetModel = {
                kind: 'NODE_FRAGMENT',
                model: new drivine.ModelRegistry().fragment(Doc)
            };
            expect(shared.sharedCompilerLoaded()).toBe(false);

            backend.matching(target, { label: 'Doc', properties: ['body'], text: 'graph', limit: 5 });
            expect(shared.sharedCompilerLoaded()).toBe(true);
            expect(required).toHaveBeenCalledTimes(1);
        });
    });
});
