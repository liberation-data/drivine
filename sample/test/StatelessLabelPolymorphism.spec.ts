import { randomUUID } from 'crypto';
import { anyOf, StatelessGraphObjectManager } from '@liberation-data/drivine';
import {
    AnonymousGuideUser,
    AnonymousWebUser,
    GuideUser,
    GuideUserWithOptionalWebUser,
    GuideUserWithPolymorphicWebUser,
    RegisteredWebUser,
    WebUser
} from '../src';
import { SampleApp, sampleStores, startSample } from './support/SampleApp';

/**
 * drivine4j's StatelessLabelPolymorphismTest: a related node loads as the subclass its labels say, a view can require
 * one subclass, instanceOf filters by subclass at query time, and a save writes the labels of the object's own class.
 * (Where drivine4j reads a node's labels back with raw Cypher, here the node is loaded as the subclass, which only a
 * node carrying its labels is.)
 */
describe.each(sampleStores())('label polymorphism on $type', (engine) => {
    let sample: SampleApp;
    let gom: StatelessGraphObjectManager;
    let withAnonymous: string;
    let withRegistered: string;
    let anonymousId: string;

    const guide = (uuid: string, guideProgress: number, webUser?: WebUser): GuideUserWithPolymorphicWebUser =>
        Object.assign(new GuideUserWithPolymorphicWebUser(), {
            core: Object.assign(new GuideUser(), { uuid, guideProgress }),
            webUser
        });
    const anonymous = (uuid: string, displayName: string, anonymousToken: string): AnonymousWebUser =>
        Object.assign(new AnonymousWebUser(), { uuid, displayName, anonymousToken });
    const registered = (uuid: string, displayName: string, email: string): RegisteredWebUser =>
        Object.assign(new RegisteredWebUser(), { uuid, displayName, email });

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
        [withAnonymous, withRegistered, anonymousId] = [randomUUID(), randomUUID(), randomUUID()];
        await gom.saveAll([
            guide(withAnonymous, 10, anonymous(anonymousId, 'Anon User', 'token-abc')),
            guide(withRegistered, 20, registered(randomUUID(), 'Registered User', 'test@example.com'))
        ]);
    });

    it('should load a related node as the subclass its labels say, with its own properties', async () => {
        const results = await gom.loadAll(GuideUserWithPolymorphicWebUser);
        expect(results).toHaveLength(2);
        const anon = results.find((it) => it.core.uuid === withAnonymous)!.webUser;
        expect(anon).toBeInstanceOf(AnonymousWebUser);
        expect([(anon as AnonymousWebUser).anonymousToken, anon!.uuid]).toEqual(['token-abc', anonymousId]);
        const reg = results.find((it) => it.core.uuid === withRegistered)!.webUser;
        expect(reg).toBeInstanceOf(RegisteredWebUser);
        expect((reg as RegisteredWebUser).email).toEqual('test@example.com');
    });

    it('should load subclasses through an optional relationship too', async () => {
        const results = await gom.loadAll(GuideUserWithOptionalWebUser, (q) => ({
            where: q.core.guideProgress.gte(0)
        }));
        expect(results.find((it) => it.core.uuid === withAnonymous)!.webUser).toBeInstanceOf(AnonymousWebUser);
        expect(results.find((it) => it.core.uuid === withRegistered)!.webUser).toBeInstanceOf(RegisteredWebUser);
    });

    it('should load only the roots whose relationship leads to the subclass a view requires', async () => {
        const results = await gom.loadAll(AnonymousGuideUser);
        expect(results.map((it) => [it.core.uuid, it.webUser.anonymousToken, it.webUser.displayName])).toEqual([
            [withAnonymous, 'token-abc', 'Anon User']
        ]);
        const filtered = await gom.loadAll(AnonymousGuideUser, (q) => ({ where: q.core.guideProgress.gte(5) }));
        expect(filtered.map((it) => it.core.guideProgress)).toEqual([10]);
        expect(await gom.loadAll(AnonymousGuideUser, (q) => ({ where: q.core.guideProgress.gte(100) }))).toEqual([]);
    });

    it('should filter by subclass at query time with instanceOf, alone, with other conditions, or ORed', async () => {
        const anon = await gom.loadAll(GuideUserWithPolymorphicWebUser, (q) => ({
            where: q.webUser.instanceOf(AnonymousWebUser)
        }));
        expect(anon.map((it) => it.core.uuid)).toEqual([withAnonymous]);
        const reg = await gom.loadAll(GuideUserWithPolymorphicWebUser, (q) => ({
            where: [q.core.guideProgress.gte(5), q.webUser.instanceOf(RegisteredWebUser)]
        }));
        expect(reg.map((it) => it.core.uuid)).toEqual([withRegistered]);
        const none = await gom.loadAll(GuideUserWithPolymorphicWebUser, (q) => ({
            where: [q.core.guideProgress.gte(100), q.webUser.instanceOf(AnonymousWebUser)]
        }));
        expect(none).toEqual([]);
        const either = await gom.loadAll(GuideUserWithPolymorphicWebUser, (q) => ({
            where: anyOf(q.webUser.instanceOf(AnonymousWebUser), q.webUser.instanceOf(RegisteredWebUser))
        }));
        expect(either).toHaveLength(2);
    });

    it("should save a related node with its own class's labels", async () => {
        const guideId = randomUUID();
        const webUserId = randomUUID();
        await gom.save(guide(guideId, 50));
        const [loaded] = await gom.loadAll(GuideUserWithPolymorphicWebUser, (q) => ({
            where: q.core.uuid.eq(guideId)
        }));
        expect(loaded.webUser).toBeUndefined();
        loaded.webUser = anonymous(webUserId, 'New Anonymous User', 'new-token-xyz');
        await gom.save(loaded);
        expect(await gom.load(AnonymousWebUser, webUserId)).toBeInstanceOf(AnonymousWebUser);
        const found = await gom.loadAll(GuideUserWithPolymorphicWebUser, (q) => ({
            where: [q.core.uuid.eq(guideId), q.webUser.instanceOf(AnonymousWebUser)]
        }));
        expect((found[0].webUser as AnonymousWebUser).anonymousToken).toEqual('new-token-xyz');
    });

    it('should save each subclass with its labels', async () => {
        const [first, second, anonId, regId] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
        await gom.saveAll([guide(first, 10), guide(second, 20)]);
        const guides = await gom.loadAll(GuideUserWithPolymorphicWebUser, (q) => ({
            where: anyOf(q.core.uuid.eq(first), q.core.uuid.eq(second))
        }));
        const one = guides.find((it) => it.core.uuid === first)!;
        const two = guides.find((it) => it.core.uuid === second)!;
        one.webUser = anonymous(anonId, 'Anon', 'anon-token');
        two.webUser = registered(regId, 'Registered', 'reg@example.com');
        await gom.save(one);
        await gom.save(two);
        expect(await gom.load(AnonymousWebUser, anonId)).toBeDefined();
        expect(await gom.load(RegisteredWebUser, regId)).toBeDefined();
        const ours = (it: GuideUserWithPolymorphicWebUser): boolean =>
            it.core.uuid === first || it.core.uuid === second;
        const anonGuides = (
            await gom.loadAll(GuideUserWithPolymorphicWebUser, (q) => ({
                where: q.webUser.instanceOf(AnonymousWebUser)
            }))
        ).filter(ours);
        const regGuides = (
            await gom.loadAll(GuideUserWithPolymorphicWebUser, (q) => ({
                where: q.webUser.instanceOf(RegisteredWebUser)
            }))
        ).filter(ours);
        expect([anonGuides.map((it) => it.core.uuid), regGuides.map((it) => it.core.uuid)]).toEqual([
            [first],
            [second]
        ]);
    });
});
