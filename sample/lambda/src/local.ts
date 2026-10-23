import { createServer, IncomingMessage, Server } from 'http';
import { DatabaseRegistry } from '@liberation-data/drivine';
import { handler } from './handler';
import { HttpHandler } from './HiringApp';

/**
 * Serves the handler over plain HTTP, turning each request into the event API Gateway would send, so the Lambda runs
 * on your machine. Not for production: API Gateway does this there.
 */
export function serve(lambda: HttpHandler, port: number): Server {
    return createServer((request, response) => {
        let body = '';
        request.setEncoding('utf8');
        request.on('data', (chunk: string) => (body += chunk));
        request.on('end', () => {
            invoke(lambda, request, body)
                .then((result) => response.writeHead(result.statusCode, result.headers).end(result.body))
                .catch((e) => response.writeHead(500, { 'content-type': 'text/plain' }).end(String(e)));
        });
    }).listen(port);
}

async function invoke(lambda: HttpHandler, request: IncomingMessage, body: string): ReturnType<HttpHandler> {
    return lambda({
        rawPath: new URL(request.url ?? '/', 'http://localhost').pathname,
        requestContext: { http: { method: request.method ?? 'GET' } },
        body: body.length > 0 ? body : undefined
    });
}

// npm run start-lambda-sample, with DATABASE_* in the environment or a .env file.
if (require.main === module) {
    const port = Number(process.env.PORT ?? 3000);
    const server = serve(handler, port);
    process.stdout.write(`The hiring Lambda is at http://localhost:${port}: GET /leads, POST /hires\n`);
    process.on('SIGINT', () => {
        server.close();
        Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end())).catch((e) =>
            process.stderr.write(`${e}\n`)
        );
    });
}
