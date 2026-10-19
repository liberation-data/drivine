import { randomUUID } from 'crypto';
import {
    count,
    hop,
    key,
    max,
    nodeRef,
    pathKey,
    RelateMode,
    StatelessGraphObjectManager,
    sum
} from '@liberation-data/drivine';
import { AnonymousWebUser, IssueCore, Person, RegisteredWebUser, WebUser } from '../src';
import { SampleApp, sampleStores, startSample } from './support/SampleApp';

/**
 * drivine4j's StatelessGroupsDslTest: grouped reads over the references of a fragment, by a property or a node a path
 * reaches, with filtered counts, sums, a having and an order.
 */
describe.each(sampleStores())('groups on $type', (engine) => {
    let sample: SampleApp;
    let gom: StatelessGraphObjectManager;
    /** Marks one test's issues: each test's are told apart by their title. */
    let batch: string;

    const issue = async (id: number, state?: string, locked = false): Promise<IssueCore> =>
        gom.save(Object.assign(new IssueCore(), { uuid: randomUUID(), id, state, title: batch, locked }));

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
        batch = `groups-${randomUUID()}`;
    });

    it('should group issues by a property, with a filtered count, a having and an order', async () => {
        await issue(1, 'open', true);
        await issue(2, 'open');
        await issue(3, 'closed');
        await issue(4);
        const states = await gom.groups.load(IssueCore, (q) => ({
            where: q.title.eq(batch),
            keys: { state: key(q.state) },
            aggregates: { issues: count(), locked: count(q.locked.eq(true)), highest: max(q.id) },
            having: [['highest', 'lte', 3]],
            orderBy: [['issues', 'desc']]
        }));
        expect(states.map((it) => [it.state, it.issues, it.locked])).toEqual([
            ['open', 2, 1],
            ['closed', 1, 0]
        ]);
    });

    it('should group issues by the person they are assigned to, who loads as a fragment', async () => {
        const ada = await gom.save(Object.assign(new Person(), { uuid: randomUUID(), name: 'Ada' }));
        const bob = await gom.save(Object.assign(new Person(), { uuid: randomUUID(), name: 'Bob' }));
        const issues = [await issue(1, 'open'), await issue(2, 'open'), await issue(3, 'open')];
        for (const [assigned, person] of [
            [issues[0], ada],
            [issues[1], ada],
            [issues[2], bob],
            [issues[2], ada]
        ] as [IssueCore, Person][]) {
            await gom.edges.relate(
                nodeRef(IssueCore, assigned.uuid),
                nodeRef(Person, person.uuid),
                'ASSIGNED_TO',
                {},
                RelateMode.CREATE
            );
        }
        const assignedTo = await gom.groups.load(IssueCore, (q) => ({
            where: q.title.eq(batch),
            keys: { person: pathKey(Person, [hop('ASSIGNED_TO')]) },
            aggregates: { open: count(), numbers: sum(q.id) },
            orderBy: [['open', 'desc']]
        }));
        expect(assignedTo.map((it) => [it.person.name, it.open, it.numbers])).toEqual([
            ['Ada', 3, 6],
            ['Bob', 1, 3]
        ]);
        expect(assignedTo[0].person).toBeInstanceOf(Person);
    });

    it("should group an abstract fragment's nodes, and a subclass's by its own property", async () => {
        await gom.saveAll([
            Object.assign(new AnonymousWebUser(), { uuid: randomUUID(), displayName: batch, anonymousToken: 't1' }),
            Object.assign(new AnonymousWebUser(), { uuid: randomUUID(), displayName: batch, anonymousToken: 't2' }),
            Object.assign(new RegisteredWebUser(), { uuid: randomUUID(), displayName: batch, email: 'ada@example.com' })
        ]);
        const all = await gom.groups.load(WebUser, (q) => ({
            where: q.displayName.eq(batch),
            keys: { name: key(q.displayName) },
            aggregates: { users: count() }
        }));
        expect(all.map((it) => [it.name, it.users])).toEqual([[batch, 3]]);
        const anonymous = await gom.groups.load(AnonymousWebUser, (q) => ({
            where: q.displayName.eq(batch),
            keys: { token: key(q.anonymousToken) },
            aggregates: { users: count() }
        }));
        expect(anonymous.map((it) => [it.token, it.users])).toEqual([
            ['t1', 1],
            ['t2', 1]
        ]);
    });
});
