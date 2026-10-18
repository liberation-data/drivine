import { StatelessGraphObjectManager } from '@liberation-data/drivine';
import { SampleResolverNode } from '../src';
import { SampleApp, sampleStores, startSample } from './support/SampleApp';

/**
 * drivine4j's GeneratedKeyResolverTest, which checks the key resolver its code generator writes for a fragment with
 * both a renamed property and a property bag. TypeScript has no generator: the references resolve the same keys from
 * the class, so here the queries are the test. A renamed field reads its stored name; a bag's entries read the keys
 * under its prefix.
 */
describe.each(sampleStores())('key resolution on $type', (engine) => {
    let sample: SampleApp;
    let gom: StatelessGraphObjectManager;

    const node = (id: string, sectionId: string, tier: string): SampleResolverNode =>
        Object.assign(new SampleResolverNode(), { id, sectionId, metadata: { tier } });

    beforeAll(async () => {
        sample = await startSample(engine);
        gom = sample.gom;
    });

    afterAll(async () => {
        await sample.clear();
        await sample.close();
    });

    beforeEach(async () => {
        await sample.clear();
        await gom.saveAll([node('r1', 's1', 'gold'), node('r2', 's2', 'silver')]);
    });

    it('should filter by a renamed field, through its stored name', async () => {
        const found = await gom.loadAll(SampleResolverNode, (q) => ({ where: q.sectionId.eq('s2') }));
        expect(found.map((it) => [it.id, it.sectionId, it.metadata.tier])).toEqual([['r2', 's2', 'silver']]);
    });

    it("should filter by a bag's entry, under the bag's prefix", async () => {
        const found = await gom.loadAll(SampleResolverNode, (q) => ({ where: q.metadata.tier.eq('gold') }));
        expect(found.map((it) => it.id)).toEqual(['r1']);
    });
});
