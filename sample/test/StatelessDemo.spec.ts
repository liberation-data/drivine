import { randomUUID } from 'crypto';
import { RemovedTargets, StatelessGraphObjectManager } from '@liberation-data/drivine';
import {
    Issue,
    IssueCore,
    Organization,
    Person,
    PersonCareer,
    PersonContext,
    RaisedAndAssignedIssue,
    WorkHistory
} from '../src';
import { SampleApp, sampleStores, startSample } from './support/SampleApp';

const organization = (uuid: string, name: string): Organization => Object.assign(new Organization(), { uuid, name });
const person = (uuid: string, name: string, bio?: string): Person => Object.assign(new Person(), { uuid, name, bio });
const job = (target: Organization, startDate: string, role: string, tags?: string[]): WorkHistory =>
    Object.assign(new WorkHistory(), { target, startDate, role, tags });

/**
 * drivine4j's StatelessDemoTest: loading views with filters, relationship fragments, a view that is its root's
 * interface, removing relationships safely, the typed query DSL, and saves that are idempotent. The data is written
 * through the object manager, so the demo runs on every store.
 */
describe.each(sampleStores())('the demo on $type', (engine) => {
    let sample: SampleApp;
    let gom: StatelessGraphObjectManager;
    let acme: Organization;
    let startup: Organization;
    let alice: string;
    let bob: string;
    let carol: string;

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
        acme = organization(randomUUID(), 'Acme Corp');
        startup = organization(randomUUID(), 'Startup Inc');
        [alice, bob, carol] = [randomUUID(), randomUUID(), randomUUID()];
        const career = (uuid: string, name: string, bio: string, history: WorkHistory): PersonCareer =>
            Object.assign(new PersonCareer(), { person: person(uuid, name, bio), employmentHistory: [history] });
        await gom.saveAll([
            career(
                alice,
                'Alice Engineer',
                'Senior Backend Developer',
                job(acme, '2023-01-15', 'Senior Engineer', ['backend', 'senior'])
            ),
            career(bob, 'Bob Designer', 'UX Lead', job(acme, '2022-06-01', 'Lead Designer', ['design', 'ux'])),
            career(
                carol,
                'Carol Founder',
                'CEO and Founder',
                job(startup, '2021-03-10', 'CEO', ['leadership', 'founder'])
            )
        ]);
    });

    // DEMO 1: loading collections, with typed filters.

    it('should load a collection of people with their relationships', async () => {
        const everyone = await gom.loadAll(PersonContext);
        expect(everyone).toHaveLength(3);
        const atAcme = everyone.filter((it) => it.worksFor.some((org) => org.name === 'Acme Corp'));
        expect(atAcme).toHaveLength(2);
        const found = atAcme.find((it) => it.person.name === 'Alice Engineer')!;
        expect(found.person.bio).toEqual('Senior Backend Developer');
        expect(found.worksFor).toHaveLength(1);
    });

    it("should filter a collection by a person's bio", async () => {
        const leads = await gom.loadAll(PersonContext, (q) => ({ where: q.person.bio.contains('Lead') }));
        expect(leads.map((it) => [it.person.name, it.person.bio])).toEqual([['Bob Designer', 'UX Lead']]);
    });

    it('should filter by a property that has no value', async () => {
        await gom.save(
            Object.assign(new PersonContext(), {
                person: person(randomUUID(), 'Dave Minimalist'),
                worksFor: [organization(randomUUID(), 'Stealth Startup')]
            })
        );
        const withoutBio = await gom.loadAll(PersonContext, (q) => ({ where: q.person.bio.isNull() }));
        expect(withoutBio.map((it) => it.person.name)).toEqual(['Dave Minimalist']);
        expect(withoutBio[0].person.bio).toBeUndefined();
        const withBio = await gom.loadAll(PersonContext, (q) => ({ where: q.person.bio.isNotNull() }));
        expect(withBio).toHaveLength(3);
        expect(withBio.every((it) => it.person.bio !== undefined)).toBe(true);
    });

    // DEMO 2: relationship fragments, properties on a relationship.

    it("should load a relationship's properties with the node it leads to", async () => {
        const career = (await gom.load(PersonCareer, alice))!;
        expect(career.person.name).toEqual('Alice Engineer');
        const [employment] = career.employmentHistory;
        expect([employment.startDate, employment.role, employment.target.name]).toEqual([
            '2023-01-15',
            'Senior Engineer',
            'Acme Corp'
        ]);
    });

    it("should load every career with its relationships' properties", async () => {
        const careers = await gom.loadAll(PersonCareer);
        expect(careers).toHaveLength(3);
        const found = careers.find((it) => it.person.name === 'Alice Engineer')!;
        expect([found.employmentHistory[0].role, found.employmentHistory[0].startDate]).toEqual([
            'Senior Engineer',
            '2023-01-15'
        ]);
    });

    // DEMO 3: a view that is an Issue itself, handing its root's fields on.

    it('should let a view stand for its root through an interface', async () => {
        const issueId = randomUUID();
        const tester = person(randomUUID(), 'Dave Tester', 'QA Engineer');
        await gom.save(
            Object.assign(new RaisedAndAssignedIssue(), {
                issue: Object.assign(new IssueCore(), {
                    uuid: issueId,
                    id: 999,
                    title: 'Bug in login',
                    body: 'Users cannot log in',
                    state: 'open',
                    locked: false
                }),
                assignedTo: [tester],
                raisedBy: Object.assign(new PersonContext(), { person: tester, worksFor: [] })
            })
        );
        const raised = (await gom.load(RaisedAndAssignedIssue, issueId))!;
        const describe = (issue: Issue): string => `${issue.title} (state: ${issue.state})`;
        expect(describe(raised)).toEqual('Bug in login (state: open)');
        expect(raised.assignedTo[0].name).toEqual('Dave Tester');
        expect(raised.raisedBy.person.name).toEqual('Dave Tester');
    });

    // DEMO 4: removing relationships, and what happens to the nodes they led to.

    it('should keep the node a removed relationship led to, by default', async () => {
        const career = (await gom.load(PersonCareer, carol))!;
        career.employmentHistory = [];
        await gom.save(career, { replace: ['employmentHistory'] });
        expect((await gom.load(PersonCareer, carol))!.employmentHistory).toEqual([]);
        expect(await gom.load(Organization, startup.uuid)).toBeDefined();
    });

    it('should delete the node a removed relationship led to when nothing else refers to it', async () => {
        const solo = organization(randomUUID(), 'Solo Org');
        const soloAlice = randomUUID();
        await gom.save(
            Object.assign(new PersonCareer(), {
                person: person(soloAlice, 'Solo Alice', 'Only employee'),
                employmentHistory: [job(solo, '2024-01-01', 'Everything')]
            })
        );
        const career = (await gom.load(PersonCareer, soloAlice))!;
        career.employmentHistory = [];
        await gom.save(career, { replace: ['employmentHistory'], removedTargets: RemovedTargets.DELETE_UNREFERENCED });
        expect(await gom.load(Organization, solo.uuid)).toBeUndefined();
        expect(await gom.load(Organization, acme.uuid)).toBeDefined();
    });

    // DEMO 5: the typed query DSL.

    it('should check queries at compile time, as the generated DSL does', async () => {
        const results = await gom.loadAll(PersonCareer, (q) => ({ where: q.person.name.eq('Alice Engineer') }));
        expect(results.map((it) => [it.person.name, it.employmentHistory[0].role])).toEqual([
            ['Alice Engineer', 'Senior Engineer']
        ]);
        // q.person.namee, or q.person.name.gt(3), would not compile.
    });

    it("should load a relationship fragment's list property, kept as JSON", async () => {
        expect((await gom.load(PersonCareer, alice))!.employmentHistory[0].tags).toEqual(['backend', 'senior']);
        const results = await gom.loadAll(PersonCareer, (q) => ({ where: q.person.name.eq('Alice Engineer') }));
        expect(results[0].employmentHistory[0].tags).toEqual(['backend', 'senior']);
    });

    // DEMO 6: saves are idempotent.

    it('should not make a node again when one is saved again', async () => {
        const org = organization(randomUUID(), 'Idempotent Corp');
        for (let i = 0; i < 5; i++) {
            await gom.save(org);
        }
        expect(await gom.count(Organization, (q) => ({ where: q.uuid.eq(org.uuid) }))).toBe(1);
    });

    it('should update a node in place when it is saved again with other values', async () => {
        const id = randomUUID();
        await gom.save(person(id, 'Original Name', 'v1'));
        await gom.save(person(id, 'Updated Name', 'v2'));
        const results = await gom.loadAll(Person, (q) => ({ where: q.uuid.eq(id) }));
        expect(results.map((it) => [it.name, it.bio])).toEqual([['Updated Name', 'v2']]);
    });

    it('should not duplicate a view root or its relationships when the view is saved again', async () => {
        const [career] = await gom.loadAll(PersonCareer, (q) => ({ where: q.person.name.eq('Alice Engineer') }));
        for (let i = 0; i < 3; i++) {
            await gom.save(career);
        }
        expect(await gom.count(Person, (q) => ({ where: q.uuid.eq(alice) }))).toBe(1);
        expect((await gom.load(PersonCareer, alice))!.employmentHistory).toHaveLength(1);
    });
});
