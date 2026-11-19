import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    backendFor,
    DatabaseRegistry,
    DatabaseType,
    ModelRegistry,
    NodeFragment,
    NodeId,
    PersistenceManager,
    PersistenceManagerFactory,
    QuerySpecification,
    StatelessGraphObjectManager,
    TransactionContextHolder
} from '@liberation-data/drivine';

@NodeFragment({ labels: ['MatchesRun'] })
class Word {
    @NodeId() id: string;
    text: string;
}

/**
 * Compiled Cypher's `=~` and the query DSL's `matches`, run on SQLite, which Node bundles, so no container: each reads
 * its pattern as Java does, with `UNICODE_CHARACTER_CLASS`, through the module's `regexp` (#632, #568, #560), so `\w`
 * matches `é`, as it does on drivine4j, where V8 read it as ASCII.
 */
describe('=~ and matches, run on SQLite', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'drivine-sqlite-matches-'));
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;

    beforeAll(async () => {
        DatabaseRegistry.getInstance()
            .builder()
            .withProperties({ databaseType: DatabaseType.SQLITE, host: '', databaseName: path.join(folder, 'g.db') })
            .register('matches-run');
        pm = new PersistenceManagerFactory(DatabaseRegistry.getInstance(), TransactionContextHolder.getInstance()).get(
            'matches-run',
            'NON_TRANSACTIONAL'
        );
        gom = new StatelessGraphObjectManager(pm, backendFor(DatabaseType.SQLITE), new ModelRegistry());
        await gom.saveAll([
            Object.assign(new Word(), { id: 'w1', text: 'café' }),
            Object.assign(new Word(), { id: 'w2', text: 'a b' })
        ]);
    });

    afterAll(() => fs.rmSync(folder, { recursive: true, force: true }));

    it("should match café with \\w+ in compiled Cypher's =~", async () => {
        const matched = await pm.query<boolean[]>(
            new QuerySpecification<boolean[]>({
                text: "RETURN ['café' =~ '\\\\w+', 'c' =~ '[a-z&&b]']",
                language: 'CYPHER'
            })
        );
        expect(matched).toEqual([[true, false]]);
    });

    it('should match café with \\w+ in the query DSL', async () => {
        const found = await gom.loadAll(Word, (q: any) => ({ where: q.text.matches('\\w+') }));
        expect(found.map((it) => it.id)).toEqual(['w1']);
    });
});
