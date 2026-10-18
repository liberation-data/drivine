import { StatelessGraphObjectManager } from '@liberation-data/drivine';
import { SampleApp, sampleStores, startSample } from './support/SampleApp';

/**
 * drivine4j's StatelessIndexAdvicePropertyTest: the index advice an application configures, as drivine4j's
 * `drivine.query.index-advice` and here DrivineModule's `query`, reaches the managers the module hands out.
 */
describe.each(sampleStores())('index advice on $type', (engine) => {
    let sample: SampleApp | undefined;

    afterEach(async () => {
        await sample?.close();
        sample = undefined;
    });

    it('should reach the manager the module made', async () => {
        sample = await startSample(engine, { query: { indexAdvice: 'FAIL' } });
        expect(sample.app.get(StatelessGraphObjectManager).indexAdvice).toEqual('FAIL');
    });

    // Ordering without an index is correct, only unindexed: an unset option must not break an application.
    it('should be WARN when nothing is configured', async () => {
        sample = await startSample(engine);
        expect(sample.gom.indexAdvice).toEqual('WARN');
    });
});
