import { randomUUID } from 'crypto';
import {
    AnonymousGuideUser,
    AnonymousWebUser,
    GuideUser,
    GuideUserWithOptionalWebUser,
    GuideUserWithRequiredWebUser,
    RegisteredWebUser,
    WebUser
} from '../src';
import { SampleApp, sampleStores, startSample } from './support/SampleApp';

/**
 * drivine4j's StatelessRequiredRelationshipTest: a view whose single relationship is required loads only the roots
 * that have it; one whose relationship is optional loads every root.
 */
describe.each(sampleStores())('required relationships on $type', (engine) => {
    let sample: SampleApp;
    let withoutWebUser: string;
    let withAnonymous: string;

    beforeAll(async () => {
        sample = await startSample(engine);
    });

    afterAll(async () => {
        await sample.clear();
        await sample.close();
    });

    beforeEach(async () => {
        await sample.clear();
        withAnonymous = randomUUID();
        withoutWebUser = randomUUID();
        const guide = (uuid: string, guideProgress: number, webUser?: WebUser): GuideUserWithOptionalWebUser =>
            Object.assign(new GuideUserWithOptionalWebUser(), {
                core: Object.assign(new GuideUser(), { uuid, guideProgress }),
                webUser
            });
        const registered = (displayName: string, email: string): RegisteredWebUser =>
            Object.assign(new RegisteredWebUser(), { uuid: randomUUID(), displayName, email });
        await sample.gom.saveAll([
            guide(randomUUID(), 10, registered('Basic User', 'basic@example.com')),
            guide(
                withAnonymous,
                20,
                Object.assign(new AnonymousWebUser(), {
                    uuid: randomUUID(),
                    displayName: 'Anon User',
                    anonymousToken: 'token123'
                })
            ),
            guide(randomUUID(), 30, registered('Registered User', 'user@example.com')),
            guide(withoutWebUser, 0)
        ]);
    });

    it('should load every root through an optional relationship, with or without it', async () => {
        const results = await sample.gom.loadAll(GuideUserWithOptionalWebUser, (q) => ({
            where: q.core.guideProgress.gte(0)
        }));
        expect(results).toHaveLength(4);
        expect(results.find((it) => it.core.uuid === withoutWebUser)!.webUser).toBeUndefined();
        expect(results.filter((it) => it.webUser !== undefined)).toHaveLength(3);
    });

    it('should load only the roots that have a required relationship', async () => {
        const results = await sample.gom.loadAll(GuideUserWithRequiredWebUser);
        expect(results).toHaveLength(3);
        expect(results.every((it) => it.webUser !== undefined && it.webUser.displayName.length > 0)).toBe(true);
        expect(results.map((it) => it.core.uuid)).not.toContain(withoutWebUser);
    });

    it("should require a relationship to a subclass's labels", async () => {
        const results = await sample.gom.loadAll(AnonymousGuideUser);
        expect(results.map((it) => [it.core.uuid, it.webUser.displayName, it.webUser.anonymousToken])).toEqual([
            [withAnonymous, 'Anon User', 'token123']
        ]);
    });

    it('should combine a required relationship with a condition', async () => {
        const results = await sample.gom.loadAll(GuideUserWithRequiredWebUser, (q) => ({
            where: q.core.guideProgress.gte(15)
        }));
        expect(results.map((it) => it.core.guideProgress).sort()).toEqual([20, 30]);
    });

    it('should load none when no root has the required relationship', async () => {
        await sample.gom.deleteAll(WebUser);
        expect(await sample.gom.loadAll(GuideUserWithRequiredWebUser)).toEqual([]);
    });
});
