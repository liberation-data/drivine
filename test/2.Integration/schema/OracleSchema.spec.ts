import {
    backendFor,
    DatabaseRegistry,
    DatabaseType,
    ModelRegistry,
    NodeFragment,
    NodeId,
    PersistenceManager,
    rangeIndex,
    StatelessGraphObjectManager,
    uniquenessConstraint
} from '@liberation-data/drivine';
import { describeOnOracle, oraclePersistenceManager } from '../support/Oracle';
import { OracleSeed } from '../support/OracleSeed';

jest.setTimeout(60_000);

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
        expect(refused.sample).toEqual(['x@y']);
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
        const ids = await Promise.all([1, 2, 3, 4, 5].map(async () => (await manager().storeIdentity()).id));
        expect(new Set(ids).size).toEqual(1);
        expect((await manager().storeIdentity()).engine).toEqual(DatabaseType.ORACLE);
    });

    it("should record and read a schema catalog's version", async () => {
        const backend = backendFor(DatabaseType.ORACLE);
        const name = `ora-test-${Date.now()}`;
        expect(await pm.maybeGetOne(backend.schemaVersion().spec({ name }))).toBeUndefined();
        await pm.execute(backend.recordSchemaVersion().spec({ name, version: 'v1' }));
        await pm.execute(backend.recordSchemaVersion().spec({ name, version: 'v2' }));
        expect(await pm.maybeGetOne(backend.schemaVersion().spec({ name }))).toEqual('v2');
    });
});
