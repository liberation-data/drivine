import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
    DatabaseType,
    NonTransactionalPersistenceManager,
    QuerySpecification,
    SqliteConnectionProvider,
    cypherStatement
} from '@liberation-data/drivine';
import { EXAMPLES, MOVIES } from '../../../website/src/playground/movies';

// The playground's graph and example queries (website/src/playground/movies.ts), on SQLite as the page runs them, so a
// change to the compiler that breaks one is caught here rather than on drivine.org.
describe("the playground's examples", () => {
    const dir = mkdtempSync(join(tmpdir(), 'playground-'));
    const provider = new SqliteConnectionProvider('playground', DatabaseType.SQLITE, join(dir, 'playground.db'), {
        graph: 'movies'
    });
    const manager = new NonTransactionalPersistenceManager(provider, 'playground', DatabaseType.SQLITE);
    const cypher = (text: string) => new QuerySpecification<any>(cypherStatement(text));

    beforeAll(async () => {
        await manager.execute(cypher(MOVIES));
    });

    afterAll(async () => {
        await provider.end();
        rmSync(dir, { recursive: true, force: true });
    });

    it('writes the graph', async () => {
        expect(await manager.query(cypher('MATCH (n) RETURN count(n) AS n'))).toEqual([13]);
        expect(await manager.query(cypher('MATCH ()-[r]->() RETURN count(r) AS r'))).toEqual([17]);
    });

    it.each(EXAMPLES.map((example) => [example.label, example.cypher]))('runs "%s"', async (_label, text) => {
        const rows = await manager.query(cypher(text));
        expect(rows.length).toBeGreaterThan(0);
    });

    it('gives the first example its actors', async () => {
        expect(await manager.query(cypher(EXAMPLES[0].cypher))).toEqual([
            ['Carrie-Anne Moss', ['Trinity']],
            ['Hugo Weaving', ['Agent Smith']],
            ['Keanu Reeves', ['Neo']],
            ['Laurence Fishburne', ['Morpheus']]
        ]);
    });
});
