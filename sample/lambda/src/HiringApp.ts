import { DatabaseRegistry, GraphObjectManagerFactory, PersistenceManagerFactory } from '@liberation-data/drivine';
import { Hire, HiringService } from './HiringService';
import { OrganizationFull } from './OrganizationFull';
import { PeopleRepository } from './PeopleRepository';

/**
 * The parts of an API Gateway HTTP API event (payload format 2.0) the handler reads. With `@types/aws-lambda`, take
 * `APIGatewayProxyEventV2` instead.
 */
export interface HttpEvent {
    rawPath: string;
    requestContext: { http: { method: string } };
    body?: string;
    isBase64Encoded?: boolean;
}

/** What the handler answers: `APIGatewayProxyResultV2`'s structured form. */
export interface HttpResult {
    statusCode: number;
    headers: Record<string, string>;
    body: string;
}

export type HttpHandler = (event: HttpEvent) => Promise<HttpResult>;

export interface HiringAppOptions {
    /** The database's name: 'default' for DATABASE_*, else `<name>_DATABASE_*`. */
    database?: string;
    /** How many people an organization may have. */
    headcountLimit?: number;
}

/**
 * Wires Drivine by hand, with no Nest: the database registered from the environment, the factories, and the
 * repository and service over them. Call it once, outside the handler, so a warm Lambda keeps its connections.
 *
 * - `GET /leads`: everyone whose bio mentions leading.
 * - `POST /hires` with `{ name, bio?, organization, role, startDate? }`: 201 with the saved career, 400 when a field is
 *   missing, 409 when the organization is full.
 */
export function hiringApp(options: HiringAppOptions = {}): HttpHandler {
    const database = options.database ?? 'default';
    DatabaseRegistry.buildOrResolveFromEnv(database === 'default' ? undefined : database);
    const persistenceManagers = new PersistenceManagerFactory();
    const graphObjectManagers = new GraphObjectManagerFactory(persistenceManagers);
    const service = new HiringService(
        new PeopleRepository(graphObjectManagers.get(database)),
        options.headcountLimit ?? 50
    );

    return async (event: HttpEvent): Promise<HttpResult> => {
        const method = event.requestContext.http.method;
        if (method === 'GET' && event.rawPath === '/leads') {
            return json(200, await service.leads());
        }
        if (method === 'POST' && event.rawPath === '/hires') {
            const hire = hireIn(event);
            if (!hire) {
                return json(400, { error: 'A hire needs a name, an organization and a role' });
            }
            try {
                return json(201, await service.hire(hire));
            } catch (e) {
                if (e instanceof OrganizationFull) {
                    return json(409, { error: e.message });
                }
                throw e;
            }
        }
        return json(404, { error: `No route for ${method} ${event.rawPath}` });
    };
}

function hireIn(event: HttpEvent): Hire | undefined {
    const text = event.isBase64Encoded ? Buffer.from(event.body ?? '', 'base64').toString('utf8') : event.body;
    let hire: Partial<Hire>;
    try {
        hire = JSON.parse(text ?? '{}');
    } catch {
        return undefined;
    }
    const given = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
    return given(hire.name) && given(hire.organization) && given(hire.role) ? (hire as Hire) : undefined;
}

function json(statusCode: number, body: unknown): HttpResult {
    return { statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}
