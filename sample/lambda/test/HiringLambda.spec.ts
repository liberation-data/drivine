import { once } from 'events';
import { AddressInfo } from 'net';
import { DatabaseType, PersistenceManager } from '@liberation-data/drivine';
import {
    clearLabels,
    closeGraphEngines,
    persistenceManagerFor
} from '../../../test/2.Integration/support/GraphEngines';
import { sampleStores } from '../../test/support/SampleApp';
import { handler } from '../src/handler';
import { hiringApp, HttpEvent, HttpHandler, HttpResult } from '../src/HiringApp';
import { serve } from '../src/local';

const event = (method: string, rawPath: string, body?: string): HttpEvent => ({
    rawPath,
    requestContext: { http: { method } },
    body
});
const bodyOf = (result: HttpResult): any => JSON.parse(result.body);

afterAll(async () => closeGraphEngines());

// The Lambda without Nest, as API Gateway invokes it: its handler is given events, and answers.
describe.each(sampleStores())('the hiring Lambda on $type', (engine) => {
    let lambda: HttpHandler;
    let pm: PersistenceManager;

    const hire = async (name: string, organization: string, bio?: string): Promise<HttpResult> =>
        lambda(event('POST', '/hires', JSON.stringify({ name, bio, organization, role: 'Engineer' })));
    const leads = async (): Promise<string[]> =>
        bodyOf(await lambda(event('GET', '/leads'))).map((it: { person: { name: string } }) => it.person.name);
    // FalkorDB commits each statement by itself, so there is nothing to roll back.
    const itRollsBack = engine.type === DatabaseType.FALKORDB ? it.skip : it;

    beforeAll(async () => {
        lambda = hiringApp({ database: engine.name, headcountLimit: 2 });
        pm = persistenceManagerFor(engine);
        // The first request makes a fresh Postgres graph's tables, which clearing the labels needs.
        await lambda(event('GET', '/leads'));
    });

    beforeEach(async () => clearLabels(pm, engine, 'Person', 'Organization'));

    afterAll(async () => clearLabels(pm, engine, 'Person', 'Organization'));

    it('should hire someone, and find them among the leads', async () => {
        const hired = await hire('Ada', 'Acme', 'Team Lead');
        expect(hired.statusCode).toEqual(201);
        expect(bodyOf(hired).person.name).toEqual('Ada');
        expect(bodyOf(hired).employmentHistory[0].target.name).toEqual('Acme');
        expect((await hire('Grace', 'Acme', 'Developer')).statusCode).toEqual(201);
        expect(await leads()).toEqual(['Ada']);
    });

    it('should hire into the organization of that name when there is one', async () => {
        const first = bodyOf(await hire('Ada', 'Acme', 'Lead'));
        const second = bodyOf(await hire('Grace', 'Acme', 'Lead'));
        expect(second.employmentHistory[0].target.uuid).toEqual(first.employmentHistory[0].target.uuid);
    });

    itRollsBack('should roll the whole hire back when it takes the organization past its headcount', async () => {
        await hire('Ada', 'Acme', 'Lead');
        await hire('Grace', 'Acme', 'Lead');
        const refused = await hire('Linus', 'Acme', 'Lead');
        expect(refused.statusCode).toEqual(409);
        expect(bodyOf(refused).error).toEqual('Acme already has 2 people');
        expect(await leads()).toEqual(['Ada', 'Grace']);
    });

    it('should read a body API Gateway encoded in base64', async () => {
        const body = Buffer.from(JSON.stringify({ name: 'Ada', bio: 'Lead', organization: 'Acme', role: 'CTO' }));
        const hired = await lambda({ ...event('POST', '/hires', body.toString('base64')), isBase64Encoded: true });
        expect(hired.statusCode).toEqual(201);
        expect(await leads()).toEqual(['Ada']);
    });

    it('should refuse a hire with a field missing, or a body that is not JSON', async () => {
        expect((await lambda(event('POST', '/hires', JSON.stringify({ name: 'Ada' })))).statusCode).toEqual(400);
        expect((await lambda(event('POST', '/hires', 'Ada at Acme'))).statusCode).toEqual(400);
        expect(await leads()).toEqual([]);
    });

    it('should answer 404 on any other route', async () => {
        const result = await lambda(event('DELETE', '/hires'));
        expect(result.statusCode).toEqual(404);
        expect(bodyOf(result).error).toEqual('No route for DELETE /hires');
    });
});

// The exported handler, over DATABASE_*, served by the local runner.
describe('the hiring Lambda run locally', () => {
    const engine = { name: 'default', type: process.env.DATABASE_TYPE as DatabaseType };
    let pm: PersistenceManager;
    let base: string;
    let server: ReturnType<typeof serve>;

    beforeAll(async () => {
        pm = persistenceManagerFor(engine);
        await clearLabels(pm, engine, 'Person', 'Organization');
        server = serve(handler, 0);
        await once(server, 'listening');
        base = `http://localhost:${(server.address() as AddressInfo).port}`;
    });

    afterAll(async () => {
        server.close();
        await clearLabels(pm, engine, 'Person', 'Organization');
    });

    it('should serve the handler over HTTP', async () => {
        const hired = await fetch(`${base}/hires`, {
            method: 'POST',
            body: JSON.stringify({ name: 'Ada', bio: 'Lead', organization: 'Acme', role: 'CTO' })
        });
        expect(hired.status).toEqual(201);
        expect(hired.headers.get('content-type')).toEqual('application/json');
        const found = await fetch(`${base}/leads`);
        expect((await found.json()).map((it: { person: { name: string } }) => it.person.name)).toEqual(['Ada']);
    });
});
