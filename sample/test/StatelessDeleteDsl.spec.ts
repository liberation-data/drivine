import { randomUUID } from 'crypto';
import { StatelessGraphObjectManager } from '@liberation-data/drivine';
import { IssueCore, Organization, Person, PersonContext, RaisedAndAssignedIssue } from '../src';
import { SampleApp, sampleStores, startSample } from './support/SampleApp';

/**
 * drivine4j's StatelessDeleteDslTest: deleteAll and delete by id with conditions written in the query DSL, on the
 * root, a relationship and a nested view. A delete takes the root and its relationships, never the related nodes.
 * (drivine4j's delete-by-id condition is raw Cypher; here it is the typed condition, which every store takes.)
 */
describe.each(sampleStores())('delete with the DSL on $type', (engine) => {
    let sample: SampleApp;
    let gom: StatelessGraphObjectManager;
    let openIssue: string;
    let personId: string;
    const all = async (): Promise<RaisedAndAssignedIssue[]> => gom.loadAll(RaisedAndAssignedIssue);

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
        openIssue = randomUUID();
        personId = randomUUID();
        const person = Object.assign(new Person(), { uuid: personId, name: 'Test Person', bio: 'Test bio' });
        const raisedBy = Object.assign(new PersonContext(), {
            person,
            worksFor: [Object.assign(new Organization(), { uuid: randomUUID(), name: 'Test Org' })]
        });
        const issue = (
            uuid: string,
            id: number,
            title: string,
            state: string,
            locked: boolean
        ): RaisedAndAssignedIssue =>
            Object.assign(new RaisedAndAssignedIssue(), {
                issue: Object.assign(new IssueCore(), { uuid, id, title, body: title, state, locked }),
                assignedTo: [person],
                raisedBy
            });
        await gom.saveAll([
            issue(openIssue, 1, 'Open Issue 1', 'open', false),
            issue(randomUUID(), 2, 'Open Issue 2', 'open', true),
            issue(randomUUID(), 3, 'Closed Issue', 'closed', false)
        ]);
    });

    it('should delete the issues of one state', async () => {
        expect(await all()).toHaveLength(3);
        expect(await gom.deleteAll(RaisedAndAssignedIssue, (q) => ({ where: q.issue.state.eq('closed') }))).toBe(1);
        expect((await all()).map((it) => it.issue.state)).toEqual(['open', 'open']);
    });

    it('should delete what several conditions select', async () => {
        const deleted = await gom.deleteAll(RaisedAndAssignedIssue, (q) => ({
            where: [q.issue.state.eq('open'), q.issue.locked.eq(true)]
        }));
        expect(deleted).toBe(1);
        expect((await all()).map((it) => it.issue.state).sort()).toEqual(['closed', 'open']);
    });

    it('should delete by a text condition', async () => {
        expect(await gom.deleteAll(RaisedAndAssignedIssue, (q) => ({ where: q.issue.title.contains('Open') }))).toBe(2);
        expect((await all()).map((it) => it.issue.title)).toEqual(['Closed Issue']);
    });

    it('should delete by a related node, keeping the node', async () => {
        expect(
            await gom.deleteAll(RaisedAndAssignedIssue, (q) => ({ where: q.assignedTo.name.eq('Test Person') }))
        ).toBe(3);
        expect(await all()).toEqual([]);
        expect((await gom.load(Person, personId))!.name).toEqual('Test Person');
    });

    it("should delete by a nested view's relationship", async () => {
        expect(
            await gom.deleteAll(RaisedAndAssignedIssue, (q) => ({ where: q.raisedBy.worksFor.name.eq('Test Org') }))
        ).toBe(3);
        expect(await all()).toEqual([]);
    });

    it('should delete every one with no condition, and none when nothing matches', async () => {
        expect(await gom.deleteAll(RaisedAndAssignedIssue, (q) => ({ where: q.issue.state.eq('nonexistent') }))).toBe(
            0
        );
        expect(await all()).toHaveLength(3);
        expect(await gom.deleteAll(RaisedAndAssignedIssue)).toBe(3);
        expect(await all()).toEqual([]);
    });

    it('should delete one by id, if it meets a condition', async () => {
        expect(await gom.delete(RaisedAndAssignedIssue, openIssue, { where: (q) => q.issue.state.eq('closed') })).toBe(
            0
        );
        expect((await gom.load(RaisedAndAssignedIssue, openIssue))!.issue.state).toEqual('open');
        expect(await gom.delete(RaisedAndAssignedIssue, openIssue, { where: (q) => q.issue.state.eq('open') })).toBe(1);
        expect(await gom.load(RaisedAndAssignedIssue, openIssue)).toBeUndefined();
        expect(await all()).toHaveLength(2);
    });

    it('should keep the related nodes and their own relationships', async () => {
        await gom.deleteAll(RaisedAndAssignedIssue);
        expect((await gom.load(Person, personId))!.name).toEqual('Test Person');
        const contexts = await gom.loadAll(PersonContext);
        expect(contexts.map((it) => [it.person.name, it.worksFor[0].name])).toEqual([['Test Person', 'Test Org']]);
    });
});
