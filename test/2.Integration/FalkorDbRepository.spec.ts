import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseRegistry, DrivineModule, DrivineModuleOptions, RunWithDrivine } from '@liberation-data/drivine';
import { FalkorDbRepository } from './FalkorDbRepository';

// Requires the FALKORDB_* connection in .env (see .env.example). The same server is used in STRICT mode as
// FALKORDB_STRICT.
for (const key of Object.keys(process.env).filter((it) => it.startsWith('FALKORDB_DATABASE_'))) {
    process.env[key.replace('FALKORDB_', 'FALKORDB_STRICT_')] = process.env[key];
}
process.env.FALKORDB_STRICT_DATABASE_TRANSACTION_MODE = 'STRICT';

RunWithDrivine({ rollback: false });
describe('FalkorDbRepository', () => {
    let repo: FalkorDbRepository;
    let app: TestingModule;

    beforeAll(async () => {
        app = await Test.createTestingModule({
            imports: [
                DrivineModule.withOptions(<DrivineModuleOptions>{
                    connectionProviders: [
                        DatabaseRegistry.buildOrResolveFromEnv('FALKORDB'),
                        DatabaseRegistry.buildOrResolveFromEnv('FALKORDB_STRICT')
                    ]
                })
            ],
            providers: [FalkorDbRepository]
        }).compile();
        repo = app.get(FalkorDbRepository);
    });

    beforeEach(async () => {
        await repo.clear();
    });

    afterAll(async () => {
        await repo.clear();
        await app.close();
    });

    it('should write with named parameters and read a node back as its properties', async () => {
        await repo.createHero('Moon Girl', ['genius', 'swap minds'], new Date('2015-11-01T00:00:00Z'));
        expect(await repo.findHero('Moon Girl')).toEqual({
            name: 'Moon Girl',
            powers: ['genius', 'swap minds'],
            joined: '2015-11-01T00:00:00.000000000Z'
        });
        expect(await repo.findHero('Nobody')).toBeUndefined();
    });

    it('should compare stored times in time order', async () => {
        await repo.createHero('Early', [], new Date('2040-01-01T00:00:00Z'));
        await repo.createHero('Late', [], new Date('2040-01-01T00:00:00.5Z'));
        expect(await repo.heroNamesJoinedAfter(new Date('2040-01-01T00:00:00Z'))).toEqual(['Late']);
    });

    it('should round-trip parameter values', async () => {
        const value = { text: `it's "quoted"\nand \\ escaped`, n: 1.5, list: [1, null, 'x'], nested: { ok: true } };
        expect(await repo.echo(value)).toEqual(value);
        expect(await repo.echo(new Set([1, 2]))).toEqual([1, 2]);
    });

    it('should refuse a map key that would corrupt the statement', async () => {
        await expect(repo.echo({ 'a:1}) MATCH (n) DELETE n //': 1 })).rejects.toThrow(/map key/);
    });

    it('should map a datetime to a Date', async () => {
        expect(await repo.epoch()).toEqual(new Date('2040-01-01T10:00:00Z'));
    });

    it('should stream results through a cursor, in batches', async () => {
        expect(await repo.streamSeries(10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it('should keep a write in WARN mode when the transaction fails, as FalkorDB commits each statement', async () => {
        await expect(repo.createHeroThenFail('Devil Dinosaur')).rejects.toThrow(/Something went wrong/);
        expect(await repo.findHero('Devil Dinosaur')).toEqual(expect.objectContaining({ name: 'Devil Dinosaur' }));
    });

    it('should refuse a transaction in STRICT mode', async () => {
        await expect(repo.countHeroesStrict()).rejects.toThrow(/does not support multi-statement transactions/);
    });
});
