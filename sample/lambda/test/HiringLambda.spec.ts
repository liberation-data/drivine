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

    it('should hire someone with no bio on the start date given, and leave them out of the leads', async () => {
        const body = JSON.stringify({ name: 'Linus', organization: 'Acme', role: 'Engineer', startDate: '2024-01-15' });
        const hired = await lambda(event('POST', '/hires', body));
        expect(hired.statusCode).toEqual(201);
        expect(bodyOf(hired).employmentHistory[0].startDate).toEqual('2024-01-15');
        expect(await leads()).toEqual([]);
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
        expect((await lambda(event('POST', '/hires', 'null'))).statusCode).toEqual(400);
        expect(await leads()).toEqual([]);
    });

    // A bio that is not text would be saved, and then fail every search of the leads.
    it('should refuse a hire whose bio is not text, or whose start date is not a date', async () => {
        const hireWith = async (fields: object): Promise<HttpResult> =>
            lambda(
                event('POST', '/hires', JSON.stringify({ name: 'Ada', organization: 'Acme', role: 'CTO', ...fields }))
            );
        expect((await hireWith({ bio: 5 })).statusCode).toEqual(400);
        expect((await hireWith({ startDate: 20240101 })).statusCode).toEqual(400);
        expect((await hireWith({ startDate: '' })).statusCode).toEqual(400);
        expect((await hireWith({ startDate: 'next Monday' })).statusCode).toEqual(400);
        expect((await hireWith({ startDate: ['2024-01-15'] })).statusCode).toEqual(400);
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
        // API Gateway leaves the query string out of rawPath, and so does the runner.
        const found = await fetch(`${base}/leads?page=1`);
        expect((await found.json()).map((it: { person: { name: string } }) => it.person.name)).toEqual(['Ada']);
    });
});

// A handler that fails is an error Lambda would report: the local runner answers 500 with it.
describe('the local runner', () => {
    it('should answer 500 when the handler fails', async () => {
        const server = serve(async () => Promise.reject(new Error('The database is down')), 0);
        await once(server, 'listening');
        try {
            const result = await fetch(`http://localhost:${(server.address() as AddressInfo).port}/leads`);
            expect(result.status).toEqual(500);
            expect(await result.text()).toEqual('Error: The database is down');
        } finally {
            server.close();
        }
    });
});
