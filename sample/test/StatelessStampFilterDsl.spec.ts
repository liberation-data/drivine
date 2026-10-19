import { StatelessGraphObjectManager } from '@liberation-data/drivine';
import { randomUUID } from 'crypto';
import { StampedNote } from '../src';
import { SampleApp, sampleStores, startSample } from './support/SampleApp';

/**
 * drivine4j's StampFilterDslTest and StampOrderDslTest: a filter, an order and a keyset on a `@NodeStamp` field read
 * the property the stamp is stored under.
 */
describe.each(sampleStores())('stamp queries on $type', (engine) => {
    let sample: SampleApp;
    let gom: StatelessGraphObjectManager;
    let batch: string;

    const note = async (text: string): Promise<StampedNote> =>
        gom.save(Object.assign(new StampedNote(), { id: randomUUID(), text }));

    /** Five notes of this test's own batch, and their stamps in ascending order. */
    const savedStamps = async (): Promise<string[]> => {
        const stamps: string[] = [];
        for (let i = 1; i <= 5; i++) {
            stamps.push((await note(`${batch} ${i}`)).stamp!);
        }
        return stamps.sort();
    };

    beforeAll(async () => {
        sample = await startSample(engine);
        gom = sample.gom;
        gom.indexAdvice = 'OFF';
    });

    afterAll(async () => {
        await sample.clear();
        await sample.close();
    });

    beforeEach(async () => {
        await sample.clear();
        batch = randomUUID();
    });

    it('should find the node that carries the stamp', async () => {
        const saved = await note('Call Ada');
        await note('Call Bob');
        const found = await gom.loadAll(StampedNote, (q) => ({ where: q.stamp.eq(saved.stamp!) }));
        expect(found.map((it) => it.id)).toEqual([saved.id]);
    });

    it('should order by the stamp', async () => {
        const stamps = await savedStamps();
        const ascending = await gom.loadAll(StampedNote, (q) => ({
            where: q.text.startsWith(batch),
            orderBy: q.stamp.asc()
        }));
        const descending = await gom.loadAll(StampedNote, (q) => ({
            where: q.text.startsWith(batch),
            orderBy: q.stamp.desc()
        }));
        expect(ascending.map((it) => it.stamp)).toEqual(stamps);
        expect(descending.map((it) => it.stamp)).toEqual([...stamps].reverse());
    });

    it('should page through every node once with a keyset on the stamp', async () => {
        const stamps = await savedStamps();
        const paged: string[] = [];
        for (;;) {
            const last = paged[paged.length - 1];
            const page = await gom.loadAll(StampedNote, (q) => ({
                where: q.text.startsWith(batch),
                orderBy: q.stamp.asc(),
                seek: last === undefined ? undefined : q.stamp.after(last),
                limit: 2
            }));
            if (!page.length) {
                break;
            }
            paged.push(...page.map((it) => it.stamp!));
        }
        expect(paged).toEqual(stamps);
    });
});
