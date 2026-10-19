import { randomUUID } from 'crypto';
import { AnonymousWebUser, RegisteredWebUser, WebUser } from '../src';
import { SampleApp, sampleStores, startSample } from './support/SampleApp';

/**
 * drivine4j's StatelessFragmentDslTest: the query DSL over a bare fragment, with loadAll, count and deleteAll, a
 * condition on the node's own properties, and instanceOf over an abstract fragment.
 */
describe.each(sampleStores())('the fragment DSL on $type', (engine) => {
    let sample: SampleApp;
    const anonToken = 'anon-tok';
    const regEmail = 'reg@example.com';

    beforeAll(async () => {
        sample = await startSample(engine);
    });

    afterAll(async () => {
        await sample.clear();
        await sample.close();
    });

    beforeEach(async () => {
        await sample.clear();
        await sample.gom.saveAll([
            Object.assign(new AnonymousWebUser(), {
                uuid: randomUUID(),
                displayName: 'Anon',
                anonymousToken: anonToken
            }),
            Object.assign(new RegisteredWebUser(), { uuid: randomUUID(), displayName: 'Reg', email: regEmail })
        ]);
    });

    it('should load each node of an abstract fragment as its subclass', async () => {
        const all = await sample.gom.loadAll(WebUser, (q) => ({ where: q.displayName.neq('nobody') }));
        expect(all).toHaveLength(2);
        expect(
            all.some((it) => it instanceof AnonymousWebUser) && all.some((it) => it instanceof RegisteredWebUser)
        ).toBe(true);
    });

    it('should filter an abstract fragment to one subclass with instanceOf', async () => {
        const anonymous = await sample.gom.loadAll(WebUser, (q) => ({ where: q.instanceOf(AnonymousWebUser) }));
        expect(anonymous).toHaveLength(1);
        expect(anonymous[0]).toBeInstanceOf(AnonymousWebUser);
    });

    it("should filter by a subclass's own property, loading the subclass", async () => {
        const registered = await sample.gom.loadAll(RegisteredWebUser, (q) => ({ where: q.email.eq(regEmail) }));
        expect(registered.map((it) => it.email)).toEqual([regEmail]);
        expect(
            await sample.gom.loadAll(RegisteredWebUser, (q) => ({ where: q.email.eq('missing@example.com') }))
        ).toEqual([]);
    });

    it('should count and delete what the DSL selects', async () => {
        expect(await sample.gom.count(WebUser, (q) => ({ where: q.displayName.neq('nobody') }))).toBe(2);
        expect(await sample.gom.count(AnonymousWebUser, (q) => ({ where: q.anonymousToken.eq(anonToken) }))).toBe(1);
        expect(await sample.gom.deleteAll(RegisteredWebUser, (q) => ({ where: q.email.eq(regEmail) }))).toBe(1);
        expect(await sample.gom.loadAll(RegisteredWebUser, (q) => ({ where: q.email.eq(regEmail) }))).toEqual([]);
    });
});
