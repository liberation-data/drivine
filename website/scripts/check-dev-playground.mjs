// Starts the dev server and asks it for the playground as a browser does: the page, then its engine as the page imports
// it (`engine.mjs?import`, which Vite's dev server refused with a 403 when the file was served from public/), and the
// two .wasm files the engine fetches. Fails unless each comes back, with its type. Run after `npm run build` (or
// `npm run bundle-playground`), which writes the bundle: `npm run check:dev`.
import { dev } from 'astro';

// A port in use is passed over for the next free one, so the checks ask the port the server is on.
const server = await dev({ root: new URL('..', import.meta.url), server: { port: 4399, host: '127.0.0.1' }, logLevel: 'warn' });
const failures = [];
try {
    const base = `http://127.0.0.1:${server.address.port}`;
    const asks = [
        ['/playground/', 'text/html'],
        ['/playground/engine.mjs?import', 'text/javascript'],
        ['/playground/sqlite3.wasm', 'application/wasm'],
        ['/playground/drivine-cypher-compiler.wasm', 'application/wasm']
    ];
    for (const [path, type] of asks) {
        const response = await fetch(base + path, { headers: { 'Sec-Fetch-Dest': path.endsWith('?import') ? 'script' : 'empty' } });
        await response.arrayBuffer();
        const got = response.headers.get('content-type') ?? '';
        if (!response.ok || !got.startsWith(type)) failures.push(`${path}: ${response.status} ${got}, where ${type} was expected`);
        else console.log(`${path}: ${response.status} ${got}`);
    }
} finally {
    await server.stop();
}
if (failures.length > 0) {
    console.error(`The dev server doesn't serve the playground:\n${failures.join('\n')}`);
    process.exit(1);
}
