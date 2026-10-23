import {
    backendFor,
    FullTextIndex,
    fullTextIndex,
    VectorIndex,
    vectorIndex,
    DatabaseRegistry,
    DatabaseType,
    ModelRegistry,
    NodeFragment,
    NodeId,
    PersistenceManager,
    QuerySpecification,
    rangeIndex,
    StatelessGraphObjectManager,
    uniquenessConstraint
} from '@liberation-data/drivine';
import { describeOnOracle, oraclePersistenceManager } from '../support/Oracle';
import { OracleSeed } from '../support/OracleSeed';

jest.setTimeout(60_000);

@NodeFragment({ labels: ['OraSearch'] })
class Note {
    @NodeId() id: string;
    @FullTextIndex() text?: string;
    @VectorIndex({ dimensions: 2 }) embedding?: number[];
}

@NodeFragment({ labels: ['OraSchema'] })
class Account {
    @NodeId() id: string;
    email?: string;
    region?: string;
    rank?: number;
}

describeOnOracle('schema on Oracle', () => {
    let pm: PersistenceManager;
    let gom: StatelessGraphObjectManager;
    let seed: OracleSeed;
    const manager = (): StatelessGraphObjectManager =>
        new StatelessGraphObjectManager(pm, backendFor(DatabaseType.ORACLE), new ModelRegistry());
    const byEmail = rangeIndex('OraSchema', 'email');
    const byRegionAndRank = rangeIndex('OraSchema', ['region', 'rank']);
    const uniqueEmail = uniquenessConstraint('OraSchema', 'email');

    beforeAll(async () => {
        pm = oraclePersistenceManager();
        gom = manager();
        seed = new OracleSeed(pm, 'OraSchema');
        for (const it of [byEmail, byRegionAndRank]) {
            await gom.indexes.drop(it);
        }
        await gom.constraints.drop(uniqueEmail);
        await seed.clear();
    });

    afterAll(async () => {
        for (const it of [byEmail, byRegionAndRank]) {
            await gom.indexes.drop(it);
        }
        await gom.constraints.drop(uniqueEmail);
        await seed.clear();
        await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
        DatabaseRegistry.tearDown();
    });

    it('should make range indexes once, list them, and drop them', async () => {
        expect((await gom.indexes.ensure(byEmail)).status).toEqual('CREATED');
        expect((await gom.indexes.ensure(byEmail)).status).toEqual('ALREADY_MATCHING');
        expect((await gom.indexes.ensure(byRegionAndRank)).status).toEqual('CREATED');
        const listed = await gom.indexes.list('RANGE');
        expect(listed.filter((it) => it.label === 'OraSchema').map((it) => it.properties)).toEqual(
            expect.arrayContaining([['email'], ['region', 'rank']])
        );
        await gom.indexes.drop(byEmail);
        expect(
            (await gom.indexes.list('RANGE')).some((it) => it.label === 'OraSchema' && it.properties[0] === 'email')
        ).toBe(false);
    });

    it('should refuse a uniqueness constraint the data breaks, then make and enforce it', async () => {
        await gom.saveAll([
            Object.assign(new Account(), { id: 'a1', email: 'x@y' }),
            Object.assign(new Account(), { id: 'a2', email: 'x@y' })
        ]);
        const refused = await gom.constraints.ensure(uniqueEmail);
        expect(refused.status).toEqual('VIOLATION');
        expect(refused.sample).toEqual([
            {
                properties: { email: 'x@y' },
                count: 2,
                nodes: [{ elementId: expect.anything() }, { elementId: expect.anything() }]
            }
        ]);
        await gom.delete(Account, 'a2');
        expect((await gom.constraints.ensure(uniqueEmail)).status).toEqual('CREATED');
        expect((await gom.constraints.ensure(uniqueEmail)).status).toEqual('ALREADY_MATCHING');
        await expect(gom.save(Object.assign(new Account(), { id: 'a3', email: 'x@y' }))).rejects.toThrow(/ORA-00001/);
        await gom.save(Object.assign(new Account(), { id: 'a3', email: 'z@y' }));
    });

    it('should advise on an ordered query, and stop once the index is there', async () => {
        gom.indexAdvice = 'FAIL';
        await expect(gom.loadAll(Account, (q) => ({ orderBy: q.region.asc() }))).rejects.toThrow(
            /no matching range index/
        );
        await gom.indexes.ensure(rangeIndex('OraSchema', 'region'));
        gom.indexAdvisor.refresh();
        await gom.loadAll(Account, (q) => ({ orderBy: q.region.asc() }));
        await gom.indexes.drop(rangeIndex('OraSchema', 'region'));
        gom.indexAdvice = 'OFF';
    });

    it('should agree on one store identity across managers resolving at once', async () => {
        // As a new store: each manager ensures the key constraint, and stamps the store, at once.
        await gom.constraints.drop(uniquenessConstraint('DrivineStore', 'key'));
        await new OracleSeed(pm, 'DrivineStore').clear();
        const ids = await Promise.all([1, 2, 3, 4, 5].map(async () => (await manager().storeIdentity()).id));
        expect(new Set(ids).size).toEqual(1);
        expect((await manager().storeIdentity()).engine).toEqual(DatabaseType.ORACLE);
    });

    it('should search through the tables it makes for vector and full-text indexes, kept in step by triggers', async () => {
        const vectors = vectorIndex('OraSearch', 'embedding', 2);
        const texts = fullTextIndex('OraSearch', 'text');
        const notes = new OracleSeed(pm, 'OraSearch');
        await notes.clear();
        await gom.save(Object.assign(new Note(), { id: 'n1', text: 'graph databases', embedding: [1, 0] }));
        await gom.indexes.ensure(vectors);
        await gom.indexes.ensure(texts);
        const backend = backendFor(DatabaseType.ORACLE);
        const tableOf = async (kind: 'VECTOR' | 'FULLTEXT', properties: string[]) =>
            pm.maybeGetOne<string>(backend.searchIndexTable!(kind, 'OraSearch', properties).spec());
        expect(await tableOf('VECTOR', ['embedding'])).toMatch(/^drivine_v_OraSearchembedding_[0-9a-f]+$/);
        expect(await tableOf('FULLTEXT', ['text'])).toMatch(/^drivine_t_OraSearchtext_[0-9a-f]+$/);
        // Saved after the index: the trigger puts it in the tables.
        await gom.save(Object.assign(new Note(), { id: 'n2', text: 'relational tables', embedding: [0, 1] }));
        expect((await gom.loadNearest(Note, [0, 1], { topK: 1 })).map((it) => it.value.id)).toEqual(['n2']);
        expect((await gom.loadMatching(Note, '+relational -graph', { topK: 5 })).map((it) => it.value.id)).toEqual([
            'n2'
        ]);
        expect((await gom.loadMatching(Note, 'graph', { topK: 5 })).map((it) => it.value.id)).toEqual(['n1']);
        await gom.indexes.drop(vectors);
        await gom.indexes.drop(texts);
        expect(await tableOf('VECTOR', ['embedding'])).toBeUndefined();
        // Without the index, every node of the label is read, to the same answer.
        expect((await gom.loadMatching(Note, '+relational -graph', { topK: 5 })).map((it) => it.value.id)).toEqual([
            'n2'
        ]);
        expect((await gom.loadNearest(Note, [0, 1], { topK: 1 })).map((it) => it.value.id)).toEqual(['n2']);
        await notes.clear();
    });

    it('should keep one schema marker per owner: its version and inventory, an empty one read back empty', async () => {
        const backend = backendFor(DatabaseType.ORACLE);
        const scope = `ora-test-${Date.now()}`;
        const read = async (property: 'version' | 'items') => {
            const value = await pm.maybeGetOne<string>(backend.schemaMarker(property).spec({ scope }));
            return property === 'items' ? backend.markerItems(value) : value;
        };
        expect(await read('version')).toBeUndefined();
        await pm.execute(backend.recordSchemaMarker().spec({ scope, version: 'v1', items: '' }));
        expect(await read('items')).toEqual([]);
        await pm.execute(backend.recordSchemaMarker().spec({ scope, version: 'v2', items: 'a\nb' }));
        expect([await read('version'), await read('items')]).toEqual(['v2', ['a', 'b']]);
        await pm.execute(
            new QuerySpecification(`DELETE FROM drivine_node n WHERE JSON_VALUE(n.props, '$.scope') = $scope`).bind({
                scope
            })
        );
    });
});
