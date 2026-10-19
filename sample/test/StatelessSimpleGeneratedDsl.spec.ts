import { RaisedAndAssignedIssue } from '../src';
import { seedIssue } from './support/IssueWorld';
import { SampleApp, sampleStores, startSample } from './support/SampleApp';

/** drivine4j's StatelessSimpleGeneratedDslTest: the query DSL works at all. */
describe.each(sampleStores())('the simple DSL on $type', (engine) => {
    let sample: SampleApp;

    beforeAll(async () => {
        sample = await startSample(engine);
    });

    afterAll(async () => {
        await sample.clear();
        await sample.close();
    });

    beforeEach(async () => {
        await sample.clear();
        await seedIssue(sample.gom, {
            id: 1,
            title: 'Test Issue',
            body: 'Test body',
            person: 'Test Person',
            bio: 'Test bio',
            org: 'Test Org'
        });
    });

    it('should load all issues without a filter', async () => {
        expect(await sample.gom.loadAll(RaisedAndAssignedIssue)).toHaveLength(1);
    });

    it('should filter with the DSL', async () => {
        expect(
            await sample.gom.loadAll(RaisedAndAssignedIssue, (q) => ({ where: q.issue.state.eq('open') }))
        ).toHaveLength(1);
    });
});
