import {
    ConnectionPropertiesFromEnv,
    CypherBackend,
    cypherGrammarFor,
    DatabaseRegistry,
    DatabaseType,
    GraphRelationship,
    GraphView,
    ModelRegistry,
    NodeFragment,
    NodeId,
    NodeStamp,
    NonAtomicBatchException,
    PersistenceManager,
    PersistenceManagerFactory,
    QuerySpecification,
    Root,
    StaleObjectException,
    StatelessGraphObjectManager,
    TransactionContextHolder,
    TransactionMode
} from '@liberation-data/drivine';
import { closeGraphEngines, graphEngines, persistenceManagerFor } from '../support/GraphEngines';

@NodeFragment({ labels: ['BatchTest', 'Chunk'] })
class Chunk {
    @NodeId() id: string;
    text?: string;
    summary?: string;
    @NodeStamp() stamp?: string;
}

@NodeFragment({ labels: ['BatchTest', 'Tag'] })
class Tag {
    @NodeId() id: string;
}

@GraphView()
class Tagged {
    @Root() chunk: Chunk;
    @GraphRelationship({ type: 'TAGGED', target: () => Tag }) tags: Tag[];
}

const chunk = (id: string, fields: Partial<Chunk> = {}): Chunk => Object.assign(new Chunk(), { id, ...fields });
const tag = (id: string): Tag => Object.assign(new Tag(), { id });

describe.each(graphEngines())('saveAll on $type', (engine) => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    const ids = async (): Promise<string[]> =>
        pm.query<string>(new QuerySpecification('MATCH (n:BatchTest) RETURN n.id AS id ORDER BY id'));

    beforeAll(() => {
        pm = persistenceManagerFor(engine);
        gom = new StatelessGraphObjectManager(
            pm,
            new CypherBackend(cypherGrammarFor(engine.type)),
            new ModelRegistry()
        );
    });

    beforeEach(async () => {
        await pm.execute(new QuerySpecification('MATCH (n:BatchTest) DETACH DELETE n'));
    });

    afterAll(async () => {
        await pm.execute(new QuerySpecification('MATCH (n:BatchTest) DETACH DELETE n'));
        await closeGraphEngines();
    });

    it('should save fragments of several classes, in order, handing back stamps', async () => {
        const objects = [chunk('c1', { text: 'One' }), tag('t1'), chunk('c2', { text: 'Two' })];
        const saved = await gom.saveAll(objects);
        expect(saved).toBe(objects);
        expect(await ids()).toEqual(['c1', 'c2', 't1']);
        expect((saved[0] as Chunk).stamp).toEqual((await gom.load(Chunk, 'c1'))!.stamp);
        expect((saved[0] as Chunk).stamp).toMatch(/^[0-9a-f]{16}:[0-9a-f]{16}$/);
    });

    it('should hand each fragment its own stamp when they are given out of the order they are written in', async () => {
        await gom.save(chunk('c1', { text: 'Before' }));
        const c1 = Object.assign((await gom.load(Chunk, 'c1'))!, { text: 'One' });
        const objects = [chunk('c2', { text: 'Two' }), tag('t1'), c1];
        const saved = await gom.saveAll(objects);
        expect(saved.map((it) => it.id)).toEqual(['c2', 't1', 'c1']);
        expect((saved[0] as Chunk).stamp).toEqual((await gom.load(Chunk, 'c2'))!.stamp);
        expect((saved[2] as Chunk).stamp).toEqual((await gom.load(Chunk, 'c1'))!.stamp);
        expect((saved[0] as Chunk).stamp).not.toEqual((saved[2] as Chunk).stamp);
    });

    it('should write a fragment whose stamp is stale, which keeps the data token it had', async () => {
        await gom.saveAll([chunk('c1', { text: 'One' })]);
        const mine = (await gom.load(Chunk, 'c1'))!;
        await gom.update(Chunk, 'c1', (it) => {
            it.summary = 'Theirs';
        });
        const carried = mine.stamp!;
        mine.text = 'Mine';
        await gom.saveAll([mine]);
        expect((await gom.load(Chunk, 'c1'))!.text).toEqual('Mine');
        expect(mine.stamp!.split(':')[0]).toEqual(carried.split(':')[0]);
        await expect(gom.save(mine)).rejects.toBeInstanceOf(StaleObjectException);
    });

    it('should write only the fields named, and refuse replace on fragments', async () => {
        await gom.saveAll([chunk('c1', { text: 'One', summary: 'S' })]);
        await gom.saveAll([chunk('c1', { text: 'Changed', summary: 'Changed' })], { only: ['summary'] });
        const loaded = (await gom.load(Chunk, 'c1'))!;
        expect([loaded.text, loaded.summary]).toEqual(['One', 'Changed']);
        await expect(gom.saveAll([chunk('c1')], { replace: ['tags'] as any })).rejects.toThrow(
            /replace applies to views/
        );
    });

    it('should save views with fragments, and refuse the batch when a view is stale', async () => {
        await gom.saveAll([Object.assign(new Tagged(), { chunk: chunk('c1'), tags: [tag('t1')] })]);
        const stale = (await gom.load(Tagged, 'c1'))!;
        await gom.update(Chunk, 'c1', (it) => {
            it.text = 'Theirs';
        });
        stale.chunk.text = 'Mine';
        await expect(gom.saveAll([chunk('fresh'), stale])).rejects.toBeInstanceOf(StaleObjectException);
        expect((await gom.load(Chunk, 'c1'))!.text).toEqual('Theirs');
        if (engine.type === DatabaseType.FALKORDB) {
            // No transactions: the fragment statement ran before the refused view.
            expect(await ids()).toContain('fresh');
        } else {
            expect(await ids()).not.toContain('fresh');
        }
    });

    it('should save more fragments than go to one statement', async () => {
        const many = Array.from({ length: 1500 }, (_, i) => chunk(`m${String(i).padStart(4, '0')}`));
        await gom.saveAll(many);
        expect(await gom.count(Chunk)).toEqual(1500);
        expect(many.every((it) => it.stamp)).toBe(true);
    });

    if (engine.type === DatabaseType.FALKORDB) {
        it('should refuse a batch of more than one statement in STRICT mode, writing nothing', async () => {
            DatabaseRegistry.getInstance()
                .builder()
                .withProperties({ ...ConnectionPropertiesFromEnv('FALKORDB'), transactionMode: TransactionMode.STRICT })
                .register('FALKORDB_STRICT_BATCH');
            const strictPm = new PersistenceManagerFactory(
                DatabaseRegistry.getInstance(),
                TransactionContextHolder.getInstance()
            ).get('FALKORDB_STRICT_BATCH', 'NON_TRANSACTIONAL');
            const strict = new StatelessGraphObjectManager(
                strictPm,
                new CypherBackend(cypherGrammarFor(engine.type)),
                new ModelRegistry()
            );
            await expect(
                strict.saveAll([chunk('c1'), Object.assign(new Tagged(), { chunk: chunk('c2'), tags: [] })])
            ).rejects.toBeInstanceOf(NonAtomicBatchException);
            expect(await ids()).toEqual([]);
            await strict.saveAll([chunk('c1'), tag('t1')]);
            expect(await ids()).toEqual(['c1', 't1']);
        });
    }
});
