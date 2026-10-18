import { randomUUID } from 'crypto';
import { DatabaseType, inDrivineContext, PatchResult, StatelessGraphObjectManager } from '@liberation-data/drivine';
import { IssueCore, Person, PersonContext, RaisedAndAssignedIssue, StampedNote } from '../src';
import { SampleApp, sampleStores, startSample } from './support/SampleApp';

const changed = { found: true, applied: true, changed: true };
const unmet = { found: true, applied: false, changed: false };
const absent = { found: false, applied: false, changed: false };

/**
 * drivine4j's StatelessPatchDslTest and StatelessPatchTransactionTest: a patch of a fragment or of a view's root by id,
 * where a condition holds (on a view, one over its relationships), and a patch that joins a transaction rolled back.
 */
describe.each(sampleStores())('patch on $type', (engine) => {
    let sample: SampleApp;
    let gom: StatelessGraphObjectManager;

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
    });

    it('should patch a fragment by its id, where it meets the condition', async () => {
        const saved = await gom.save(Object.assign(new StampedNote(), { id: randomUUID(), text: 'Call Ada' }));
        const stamp = saved.stamp;
        const patchText = async (to: string, where: string): Promise<PatchResult> =>
            gom.patch(StampedNote, saved.id, { set: { text: to }, where: (q) => q.text.eq(where) });
        expect([await patchText('Call Bob', 'Call Cy'), await patchText('Call Bob', 'Call Ada')]).toEqual([
            unmet,
            changed
        ]);
        const stored = (await gom.load(StampedNote, saved.id))!;
        expect(stored.text).toEqual('Call Bob');
        expect(stored.stamp).not.toEqual(stamp);
        expect(await gom.patch(StampedNote, randomUUID(), { set: { text: 'nobody' } })).toEqual(absent);
    });

    it("should patch a view's root where its relationship meets the condition", async () => {
        const uuid = randomUUID();
        const ada = Object.assign(new Person(), { uuid: randomUUID(), name: 'Ada' });
        await gom.save(
            Object.assign(new RaisedAndAssignedIssue(), {
                issue: Object.assign(new IssueCore(), { uuid, id: 7, title: 'As raised', locked: false }),
                assignedTo: [ada],
                raisedBy: Object.assign(new PersonContext(), { person: ada, worksFor: [] })
            })
        );
        const retitle = async (title: string, assignee: string): Promise<PatchResult> =>
            gom.patch(RaisedAndAssignedIssue, uuid, {
                set: { title },
                where: (q) => q.assignedTo.name.eq(assignee)
            });
        expect(await retitle('For Bob', 'Bob')).toEqual(unmet);
        expect(await retitle('For Ada', 'Ada')).toEqual(changed);
        expect((await gom.load(IssueCore, uuid))!.title).toEqual('For Ada');
    });

    const transactional = engine.type === DatabaseType.FALKORDB ? it.skip : it;

    // FalkorDB has no transactions: nothing there is rolled back.
    transactional('should undo a patch with the transaction it joined', async () => {
        const id = randomUUID();
        const saved = await gom.save(Object.assign(new StampedNote(), { id, text: 'Call Ada' }));
        let result: unknown;
        await inDrivineContext()
            .withTransaction({ rollback: true })
            .run(async () => {
                result = await gom.patch(StampedNote, id, { set: { text: 'Call Bob' } });
                // The patch is seen inside the transaction it joined.
                expect((await gom.load(StampedNote, id))!.text).toEqual('Call Bob');
            });
        expect(result).toEqual(changed);
        const stored = (await gom.load(StampedNote, id))!;
        expect([stored.text, stored.stamp]).toEqual(['Call Ada', saved.stamp]);
    });
});
