import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    DatabaseRegistry,
    DatabaseType,
    PersistenceManager,
    PersistenceManagerFactory,
    QuerySpecification,
    SqliteConnectionProvider,
    TransactionContextHolder
} from '@liberation-data/drivine';
import { StoreLayoutError } from '@/backend/sql/StoreLayout';
import { openSqlite } from '@/connection/sqlite/SqliteDriver';
import { Declaration, StoreLayoutMigration } from '@liberation-data/drivine';

jest.setTimeout(60_000);

/**
 * A SQLite graph Drivine for TypeScript 5.0.0 wrote, in store layout 1 (`layout1-5.0.0.sqlite`, written by
 * `scripts/migration-fixture-5.0.0/fixture.js`), migrated to layout 2 by the shared module's migrator, run by StoreLayoutMigration on the store
 * itself (liberation-data/drivine#765, drivine-cypher-spec#256): refused before, a dry run that writes nothing, two
 * spellings of one moment under a unique index stopping the run as `collisions`, resumed once corrected with plain SQL,
 * and read by this version as layout 2 after.
 */
describe('a store layout migration of a graph 5.0.0 wrote, on SQLite', () => {
    const folder = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'drivine-migration-')));
    const file = path.join(folder, 'layout1.sqlite');
    const declarations: Declaration[] = [
        { label: 'Person', property: 'born', kind: 'date' },
        { label: 'KNOWS', property: 'since', kind: 'date' },
        { label: 'Event', property: 'at', kind: 'datetime' }
    ];

    const snapshot = (): string[] => {
        const db = openSqlite(file);
        try {
            return (
                db
                    .prepare(
                        'SELECT name AS a, sql AS b FROM sqlite_master UNION ALL SELECT nid, props FROM drivine_node UNION ALL SELECT eid, props FROM drivine_edge ORDER BY 1, 2'
                    )
                    .all() as { a: unknown; b: unknown }[]
            ).map((it) => `${it.a}|${it.b}`);
        } finally {
            db.close();
        }
    };
    const provider = (): SqliteConnectionProvider =>
        new SqliteConnectionProvider('migration', DatabaseType.SQLITE, file, { graph: 'drivine' });

    beforeAll(() => fs.copyFileSync(path.join(__dirname, 'layout1-5.0.0.sqlite'), file));
    afterAll(() => fs.rmSync(folder, { recursive: true, force: true }));

    it('should refuse it, dry run it, stop at a collision, finish once corrected, and read it as layout 2', async () => {
        const before = provider();
        await expect(before.connect()).rejects.toBeInstanceOf(StoreLayoutError);
        await before.end();

        const migrating = provider();
        const migration = new StoreLayoutMigration(migrating);
        await expect(migration.migrate(declarations, {} as any)).rejects.toThrow(/not yet proven/);

        const untouched = snapshot();
        const dryRun = await migration.migrate(declarations, { dryRun: true, unproven: true });
        expect(dryRun.status).toBe('dryRun');
        expect(snapshot()).toEqual(untouched);
        expect(dryRun.notes).toHaveLength(2);
        expect(dryRun.candidates).toContainEqual({ label: 'Person', property: 'nick', kind: 'date', values: 1 });

        const stopped = await migration.migrate(declarations, { unproven: true });
        expect(stopped.status).toBe('collisions');
        expect(stopped.collisions.map((it) => [it.label, it.properties])).toEqual([['Event', ['at']]]);

        // Corrected with the store's own tools, then resumed.
        const db = openSqlite(file);
        db.exec('DELETE FROM drivine_node WHERE nid = 9');
        db.close();
        const migrated = await migration.migrate(declarations, { unproven: true });
        expect(migrated.status).toBe('migrated');
        await migrating.end();

        DatabaseRegistry.getInstance()
            .builder()
            .withProperties({
                databaseType: DatabaseType.SQLITE,
                host: '',
                databaseName: file,
                defaultGraphPath: 'drivine'
            })
            .register('migrated');
        const pm: PersistenceManager = new PersistenceManagerFactory(
            DatabaseRegistry.getInstance(),
            TransactionContextHolder.getInstance()
        ).get('migrated', 'NON_TRANSACTIONAL');
        const one = async (text: string): Promise<any> => {
            const rows = await pm.query<any>(new QuerySpecification({ text, language: 'CYPHER' }));
            expect(rows).toHaveLength(1);
            return rows[0];
        };
        expect(await one("MATCH (p:Person {name: 'Ada'}) RETURN toString(p.born)")).toBe('1815-12-10');
        expect(await one("MATCH (p:Person) WHERE p.born < date('1800-01-01') RETURN p.name")).toBe('Charles');
        expect(await one("MATCH ()-[k:KNOWS]->() RETURN k.since = date('2020-01-01')")).toBe(true);
        expect(Number(await one('MATCH (r:Robot) RETURN r.`$t`'))).toBe(1);
        expect(await one("MATCH (p:Person {name: 'Mary'}) RETURN p.nick")).toBe('2024-03-15');
        expect(await one("MATCH (p:Person {name: 'Mary'}) RETURN p.nick = date('2024-03-15')")).toBe(false);
        await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
        DatabaseRegistry.tearDown();
        const objects = snapshot()
            .filter((it) => it.startsWith('drivine_'))
            .map((it) => it.split('|')[0]);
        expect(objects.filter((it) => it.startsWith('drivine_uq_') || it === 'drivine_migrate2')).toEqual([]);
    });
});

/**
 * Bytes as Drivine for TypeScript 5.0.0 saved them, as `JSON.stringify` writes them: a Uint8Array as an object of its
 * indexes, a Buffer as `{type: 'Buffer', data}`. The migration reads bytes from a list of numbers or a base64 text alone,
 * so a declaration of them refuses the graph as `invalid`, writing nothing: why `declarationsOf` declares no bytes.
 */
describe('bytes a graph 5.0.0 wrote, declared to a store layout migration', () => {
    const folder = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'drivine-migration-bytes-')));
    const file = path.join(folder, 'layout1.sqlite');

    beforeAll(() => {
        fs.copyFileSync(path.join(__dirname, 'layout1-5.0.0.sqlite'), file);
        const db = openSqlite(file);
        try {
            db.prepare(
                `UPDATE drivine_node SET props = json_set(props, '$.raw', json('{"0":1,"1":2,"2":255}'), '$.buffer', json('{"type":"Buffer","data":[1,2,255]}')) WHERE json_extract(props, '$.name') = 'Ada'`
            ).run();
        } finally {
            db.close();
        }
    });
    afterAll(() => fs.rmSync(folder, { recursive: true, force: true }));

    it('should refuse each as invalid, and write nothing', async () => {
        const provider = new SqliteConnectionProvider('migration-bytes', DatabaseType.SQLITE, file, { graph: 'drivine' });
        try {
            for (const property of ['raw', 'buffer']) {
                const report = await new StoreLayoutMigration(provider).migrate([{ label: 'Person', property, kind: 'bytes' }], {
                    unproven: true
                });
                expect(report.status).toBe('invalid');
                expect(report.properties.find((it) => it.property === property)?.invalid).toHaveLength(1);
            }
            await expect(provider.connect()).rejects.toBeInstanceOf(StoreLayoutError);
        } finally {
            await provider.end();
        }
    });
});
