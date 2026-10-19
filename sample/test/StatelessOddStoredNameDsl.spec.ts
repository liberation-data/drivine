import { DatabaseType, StatelessGraphObjectManager } from '@liberation-data/drivine';
import { randomUUID } from 'crypto';
import { OddlyStored } from '../src';
import { SampleApp, sampleStores, startSample } from './support/SampleApp';

/**
 * drivine4j's OddStoredNameDslTest: a filter and an order read a property by its stored name, whatever that holds: a
 * `$`, a `%`, a quote or a backslash is part of the name. (drivine4j also checks the names its generated DSL carries;
 * here the references come from the class, so the queries are the test.)
 */
describe.each(sampleStores())('odd stored names on $type', (engine) => {
    let sample: SampleApp;
    let gom: StatelessGraphObjectManager;

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
    });

    // FalkorDB takes a map key only as a plain identifier, and Drivine refuses any other rather than risk injection.
    const plainKeysOnly = engine.type === DatabaseType.FALKORDB ? it.skip : it;

    plainKeysOnly('should filter and order by a property whose stored name is odd', async () => {
        const batch = randomUUID();
        const odd = (id: string, price: number, rate: number, greeting: string): OddlyStored =>
            Object.assign(new OddlyStored(), { id: `${batch}-${id}`, price, rate, greeting, path: batch });
        await gom.saveAll([odd('a', 30, 3, 'hello'), odd('b', 10, 1, 'hey'), odd('c', 20, 2, 'hello')]);

        const byPrice = await gom.loadAll(OddlyStored, (q) => ({ where: q.path.eq(batch), orderBy: q.price.asc() }));
        expect(byPrice.map((it) => [it.price, it.rate])).toEqual([
            [10, 1],
            [20, 2],
            [30, 3]
        ]);

        const greeted = await gom.loadAll(OddlyStored, (q) => ({
            where: [q.path.eq(batch), q.greeting.eq('hello'), q.rate.gte(3)]
        }));
        expect(greeted).toEqual([odd('a', 30, 3, 'hello')]);
    });
});
