import { anyOf, StatelessGraphObjectManager } from '@liberation-data/drivine';
import { PersonContext, RaisedAndAssignedIssue } from '../src';
import { seedIssue } from './support/IssueWorld';
import { SampleApp, sampleStores, startSample } from './support/SampleApp';

/**
 * drivine4j's StatelessGeneratedDslTest: the query DSL over a view's root, its relationships, a nested view's root and
 * relationships, with AND, anyOf (OR) and the text operators. Every query is checked by the compiler: the references
 * come from the classes themselves.
 */
describe.each(sampleStores())('the DSL on $type', (engine) => {
    let sample: SampleApp;
    let gom: StatelessGraphObjectManager;
    const issues = async (where: Parameters<typeof gom.loadAll<RaisedAndAssignedIssue>>[1]) =>
        gom.loadAll(RaisedAndAssignedIssue, where);

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
        await seedIssue(gom, {
            id: 123,
            title: 'Implement feature X',
            body: 'This is a test issue',
            person: 'Alice Developer',
            bio: 'Senior Engineer',
            org: 'Acme Corp'
        });
    });

    it('should load every issue, with its relationships, without a filter', async () => {
        const [issue, ...rest] = await gom.loadAll(RaisedAndAssignedIssue);
        expect(rest).toEqual([]);
        expect(issue.issue.title).toEqual('Implement feature X');
        expect(issue.assignedTo.map((it) => it.name)).toEqual(['Alice Developer']);
    });

    it("should filter by the root's state", async () => {
        const results = await issues((q) => ({ where: q.issue.state.eq('open') }));
        expect(results.map((it) => it.issue.state)).toEqual(['open']);
    });

    it("should filter by the root's id", async () => {
        const results = await issues((q) => ({ where: q.issue.id.eq(123) }));
        expect(results.map((it) => it.issue.id)).toEqual([123]);
    });

    it("should filter by a nested view's root", async () => {
        const results = await issues((q) => ({ where: q.raisedBy.person.name.eq('Alice Developer') }));
        expect(results.map((it) => it.raisedBy.person.name)).toEqual(['Alice Developer']);
    });

    it("should filter by a nested view's relationship", async () => {
        const results = await issues((q) => ({ where: q.raisedBy.worksFor.name.eq('Acme Corp') }));
        expect(results.map((it) => it.raisedBy.worksFor[0].name)).toEqual(['Acme Corp']);
    });

    it('should combine filters with AND', async () => {
        const results = await issues((q) => ({ where: [q.issue.state.eq('open'), q.issue.locked.eq(false)] }));
        expect(results.map((it) => [it.issue.state, it.issue.locked])).toEqual([['open', false]]);
    });

    it('should load any view with the DSL', async () => {
        const [context] = await gom.loadAll(PersonContext);
        expect([context.person.name, context.person.bio, context.worksFor[0].name]).toEqual([
            'Alice Developer',
            'Senior Engineer',
            'Acme Corp'
        ]);
        const byOrg = await gom.loadAll(PersonContext, (q) => ({ where: q.worksFor.name.eq('Acme Corp') }));
        expect(byOrg.map((it) => it.person.name)).toEqual(['Alice Developer']);
    });

    it('should return none when nothing matches', async () => {
        expect(await issues((q) => ({ where: q.issue.state.eq('closed') }))).toEqual([]);
    });

    it('should filter by the title', async () => {
        const results = await issues((q) => ({ where: q.issue.title.eq('Implement feature X') }));
        expect(results.map((it) => it.issue.title)).toEqual(['Implement feature X']);
    });

    // anyOf (OR)

    it('should OR conditions on the root, matching none or one', async () => {
        expect(await issues((q) => ({ where: anyOf(q.issue.state.eq('closed'), q.issue.locked.eq(true)) }))).toEqual(
            []
        );
        const open = await issues((q) => ({ where: anyOf(q.issue.state.eq('open'), q.issue.state.eq('closed')) }));
        expect(open.map((it) => it.issue.state)).toEqual(['open']);
    });

    it("should OR conditions on a relationship, a nested view's root and its relationship", async () => {
        const assigned = await issues((q) => ({
            where: anyOf(q.assignedTo.name.eq('Alice Developer'), q.assignedTo.name.eq('Bob Developer'))
        }));
        expect(assigned).toHaveLength(1);
        const raised = await issues((q) => ({
            where: anyOf(q.raisedBy.person.name.eq('Alice Developer'), q.raisedBy.person.name.eq('Bob Developer'))
        }));
        expect(raised).toHaveLength(1);
        const org = await issues((q) => ({
            where: anyOf(q.raisedBy.worksFor.name.eq('Acme Corp'), q.raisedBy.worksFor.name.eq('Initech'))
        }));
        expect(org.map((it) => it.raisedBy.worksFor[0].name)).toEqual(['Acme Corp']);
    });

    it('should combine AND and OR across nested relationships', async () => {
        const results = await issues((q) => ({
            where: [
                q.issue.locked.eq(false),
                anyOf(q.raisedBy.person.name.eq('Alice Developer'), q.raisedBy.worksFor.name.eq('Initech'))
            ]
        }));
        expect(results.map((it) => [it.issue.locked, it.raisedBy.person.name])).toEqual([[false, 'Alice Developer']]);
    });

    // Text operators, and harder boolean shapes.

    it('should match text in nested views', async () => {
        expect(await issues((q) => ({ where: q.raisedBy.person.bio.contains('Engineer') }))).toHaveLength(1);
        expect(await issues((q) => ({ where: q.raisedBy.worksFor.name.startsWith('Ac') }))).toHaveLength(1);
        const leads = await gom.loadAll(PersonContext, (q) => ({ where: q.person.bio.contains('Senior') }));
        expect(leads).toHaveLength(1);
    });

    it('should OR three conditions over the root and nested views', async () => {
        const results = await issues((q) => ({
            where: anyOf(
                q.issue.locked.eq(true),
                q.raisedBy.person.name.eq('Alice Developer'),
                q.raisedBy.worksFor.name.eq('Acme Corp')
            )
        }));
        expect(results).toHaveLength(1);
    });

    it('should nest OR within AND', async () => {
        const results = await issues((q) => ({
            where: [q.issue.state.eq('open'), anyOf(q.issue.id.eq(123), q.assignedTo.name.eq('Alice Developer'))]
        }));
        expect(results.map((it) => it.issue.state)).toEqual(['open']);
        const titled = await issues((q) => ({ where: [q.issue.title.contains('feature'), q.issue.state.eq('open')] }));
        expect(titled).toHaveLength(1);
    });

    it('should OR several conditions on one nested relationship, and across relationships', async () => {
        const orgs = await issues((q) => ({
            where: anyOf(
                q.raisedBy.worksFor.name.eq('Acme Corp'),
                q.raisedBy.worksFor.name.eq('Initech'),
                q.raisedBy.worksFor.name.eq('Umbrella Corp')
            )
        }));
        expect(orgs).toHaveLength(1);
        const either = await issues((q) => ({
            where: anyOf(q.assignedTo.name.eq('Alice Developer'), q.raisedBy.person.name.eq('Alice Developer'))
        }));
        expect(either).toHaveLength(1);
    });

    it('should AND root conditions with an OR over different relationships', async () => {
        const results = await issues((q) => ({
            where: [
                q.issue.state.eq('open'),
                q.issue.locked.eq(false),
                anyOf(q.raisedBy.worksFor.name.eq('Acme Corp'), q.assignedTo.name.eq('Alice Developer'))
            ]
        }));
        expect(results.map((it) => [it.issue.state, it.issue.locked])).toEqual([['open', false]]);
    });

    it('should OR text operators over several fields', async () => {
        const results = await issues((q) => ({
            where: anyOf(
                q.issue.title.contains('Implement'),
                q.issue.body.contains('test'),
                q.raisedBy.person.bio.contains('Developer')
            )
        }));
        expect(results).toHaveLength(1);
    });

    it('should return none when no OR condition holds', async () => {
        const results = await issues((q) => ({
            where: anyOf(
                q.issue.state.eq('closed'),
                q.assignedTo.name.eq('Nobody'),
                q.raisedBy.worksFor.name.eq('NonExistent Corp')
            )
        }));
        expect(results).toEqual([]);
    });

    it('should nest OR within OR', async () => {
        const results = await issues((q) => ({
            where: anyOf(
                q.issue.state.eq('open'),
                anyOf(q.issue.locked.eq(true), q.assignedTo.name.eq('Alice Developer'))
            )
        }));
        expect(results).toHaveLength(1);
    });

    it('should serve a dashboard query: open issues from one team, mine or about a feature', async () => {
        const results = await issues((q) => ({
            where: [
                q.issue.state.eq('open'),
                q.raisedBy.worksFor.name.eq('Acme Corp'),
                anyOf(q.assignedTo.name.eq('Alice Developer'), q.issue.title.contains('feature'))
            ]
        }));
        expect(results.map((it) => it.raisedBy.worksFor[0].name)).toEqual(['Acme Corp']);
    });

    it('should AND two conditions on one nested property', async () => {
        const results = await issues((q) => ({
            where: [q.raisedBy.person.name.eq('Alice Developer'), q.raisedBy.person.bio.contains('Engineer')]
        }));
        expect(results).toHaveLength(1);
    });
});
