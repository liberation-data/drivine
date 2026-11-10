import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DrivineError } from '@/DrivineError';
import { DatabaseType } from '@/connection/DatabaseType';
import { DatabaseRegistry } from '@/connection/DatabaseRegistry';
import { PostgresResultMapper } from '@/connection/postgres/PostgresResultMapper';
import { SqliteConnection } from '@/connection/sqlite/SqliteConnection';
import { SqliteConnectionProvider } from '@/connection/sqlite/SqliteConnectionProvider';
import {
    MINIMUM_COMPILED_CYPHER_SQLITE,
    openSqlite,
    SqliteDatabase,
    sqliteOlderThan,
    sqliteVersionOf
} from '@/connection/sqlite/SqliteDriver';
import { SqliteFunctions } from '@/connection/sqlite/SqliteFunctions';
import { SqliteSpecCompiler } from '@/connection/sqlite/SqliteSpecCompiler';
import { SharedCypherCompiler } from '@/cypher/SharedCypherCompiler';
import { QuerySpecification } from '@/query/QuerySpecification';
import { cypherStatement } from '@/query/Statement';
import { GraphObjectManagerFactory } from '@/manager/GraphObjectManagerFactory';
import { PersistenceManagerFactory } from '@/manager/PersistenceManagerFactory';
import { TransactionContextHolder } from '@/transaction/TransactonContextHolder';
import { rangeIndex } from '@/schema/SchemaSpecs';
import { SchemaCatalog } from '@/schema/SchemaCatalog';
import { SchemaManager } from '@/schema/SchemaManager';

describe('compiled Cypher on a SQLite connection', () => {
    let folder: string;

    beforeEach(() => {
        folder = fs.mkdtempSync(path.join(os.tmpdir(), 'drivine-sqlite-minimum-'));
    });

    afterEach(() => {
        fs.rmSync(folder, { recursive: true, force: true });
    });

    /** A connection to a file of its own, on the SQLite `sqlite` says it is, or the one Node bundles. */
    const connection = (db: SqliteDatabase, sqlite?: string): SqliteConnection =>
        new SqliteConnection(db, new PostgresResultMapper(), 1_000, (it) => it.close(), 'drivine', sqlite);

    it('should be refused on a SQLite before 3.53.2, naming it and its Node, while plain SQL still runs', async () => {
        const emitted = jest.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
        const db = openSqlite(path.join(folder, 'old.db'));
        try {
            const old = connection(db, '3.50.4');
            const refused = old.query(new QuerySpecification(cypherStatement('RETURN 1 + 1')));
            await expect(refused).rejects.toBeInstanceOf(DrivineError);
            await expect(refused).rejects.toThrow(
                `Compiled Cypher needs SQLite 3.53.2 or later; this is SQLite 3.50.4, which Node ` +
                    `${process.versions.node} bundles. Use a Node release that bundles 3.53.2 or later`
            );
            expect(await old.query(new QuerySpecification('SELECT 1 + 1 AS two'))).toEqual([{ two: 2 }]);
            expect(await connection(db, '3.46.1').query(new QuerySpecification('SELECT 3 AS three'))).toEqual([
                { three: 3 }
            ]);
            await expect(
                connection(db, '3.52.9').query(new QuerySpecification(cypherStatement('RETURN 1')))
            ).rejects.toThrow(/this is SQLite 3\.52\.9/);
            await expect(
                connection(db, '3.53.1').query(new QuerySpecification(cypherStatement('RETURN 1')))
            ).rejects.toThrow(/this is SQLite 3\.53\.1/);
        } finally {
            db.close();
            emitted.mockRestore();
        }
    });

    it('should compile on the SQLite Node bundles, as before, where it is 3.53.2 or later', async () => {
        const emitted = jest.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
        const db = openSqlite(path.join(folder, 'real.db'));
        try {
            SqliteFunctions.register(db);
            const version = sqliteVersionOf(db);
            const query = connection(db).query(new QuerySpecification(cypherStatement('RETURN last([1, 2, 3])')));
            if (sqliteOlderThan(version, MINIMUM_COMPILED_CYPHER_SQLITE)) {
                await expect(query).rejects.toThrow(`this is SQLite ${version}`);
            } else {
                expect(await query).toEqual([3]);
            }
        } finally {
            db.close();
            emitted.mockRestore();
        }
    });

    it("should be given the provider's SQLite, read once, and compile on it through the provider", async () => {
        const emitted = jest.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
        const provider = new SqliteConnectionProvider('lite', DatabaseType.SQLITE, path.join(folder, 'provider.db'));
        const first = await provider.connect();
        const second = await provider.connect();
        try {
            const read = await first.query(new QuerySpecification('SELECT sqlite_version() AS v'));
            const version = String(read[0].v);
            expect((first as any).sqlite).toEqual(version);
            expect((second as any).sqlite).toEqual(version);
            const cypher = new QuerySpecification<number>(cypherStatement('RETURN [1, 2, 3][-1]'));
            if (sqliteOlderThan(version, MINIMUM_COMPILED_CYPHER_SQLITE)) {
                await expect(second.query(cypher)).rejects.toThrow(`this is SQLite ${version}`);
            } else {
                expect(await second.query(cypher)).toEqual([3]);
            }
        } finally {
            await first.release();
            await second.release();
            await provider.end();
            emitted.mockRestore();
        }
    });

    it("should bind a long write's steps at $_cy_program as the text the compiler gives, and run it whole", async () => {
        const emitted = jest.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
        // 561 MERGEs, whose steps written into the statement would make it longer than SQLite takes (spec#140).
        const cypher = `${Array(561).fill('MERGE (:LongWrite)').join(' ')} RETURN 1`;
        const compiled = new SharedCypherCompiler('sqlite', { name: 'drivine' }).compile(cypher);
        expect(compiled.sql).toContain('drivine_cypher($_cy_program, ');
        const program = compiled.parameters._cy_program;
        expect(typeof program).toEqual('string');
        expect(JSON.parse(program).steps.length).toBeGreaterThan(0);
        const bound = new SqliteSpecCompiler(
            new QuerySpecification({ text: compiled.sql, language: 'SQL' }).bind(compiled.parameters)
        ).formattedParams() as Record<string, unknown>;
        expect(bound._cy_program).toBe(program);
        const provider = new SqliteConnectionProvider('lite', DatabaseType.SQLITE, path.join(folder, 'long.db'));
        const db = await provider.connect();
        try {
            const version = String((await db.query(new QuerySpecification('SELECT sqlite_version() AS v')))[0].v);
            if (sqliteOlderThan(version, MINIMUM_COMPILED_CYPHER_SQLITE)) {
                return;
            }
            expect(await db.query(new QuerySpecification(cypherStatement(cypher)))).toEqual([1]);
            expect(
                await db.query(new QuerySpecification(cypherStatement('MATCH (n:LongWrite) RETURN count(n)')))
            ).toEqual([1]);
        } finally {
            await db.release();
            await provider.end();
            emitted.mockRestore();
        }
    });
});

describe('schema management on a SQLite before 3.53.2', () => {
    let folder: string;

    beforeEach(() => {
        folder = fs.mkdtempSync(path.join(os.tmpdir(), 'drivine-sqlite-schema-'));
    });

    afterEach(async () => {
        await Promise.all(DatabaseRegistry.getInstance().providers.map(async (it) => it.end()));
        DatabaseRegistry.tearDown();
        fs.rmSync(folder, { recursive: true, force: true });
    });

    it('should enforce, ensure, remove and run schema DDL, which are not compiled Cypher, while Cypher is refused', async () => {
        const emitted = jest.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
        try {
            DatabaseRegistry.getInstance()
                .builder()
                .withProperties({
                    databaseType: DatabaseType.SQLITE,
                    host: '',
                    databaseName: path.join(folder, 'old.db')
                })
                .register('old');
            // The SQLite the provider's connections run on, as though Node bundled 3.50.4.
            (DatabaseRegistry.getInstance().connectionProvider('old') as any).sqlite = '3.50.4';
            const factory = new PersistenceManagerFactory(
                DatabaseRegistry.getInstance(),
                TransactionContextHolder.getInstance()
            );
            const objects = new GraphObjectManagerFactory(factory);
            const pm = factory.get('old', 'NON_TRANSACTIONAL');
            const shared = rangeIndex('Shared', 'p');
            const own = rangeIndex('Own', 'p');
            const manager = new SchemaManager(objects, {
                catalogs: [SchemaCatalog.of(shared).named('app').forDatabase('old')]
            });
            await manager.enforce();
            await manager.ensure(SchemaCatalog.of(shared, own).named('lib').forDatabase('old'));
            await manager.remove(SchemaCatalog.of(shared, own).named('lib').forDatabase('old'));
            const listed = (await objects.get('old').indexes.list()).map((it) => it.label);
            expect(listed).toContain('Shared');
            expect(listed).not.toContain('Own');
            await pm.execute(
                new QuerySpecification<void>({ text: 'CREATE INDEX FOR (n:Ddl) ON (n.p)', language: 'CYPHER' })
            );
            expect((await objects.get('old').indexes.list()).map((it) => it.label)).toContain('Ddl');
            await expect(pm.query(new QuerySpecification(cypherStatement('RETURN 1')))).rejects.toThrow(
                /this is SQLite 3\.50\.4/
            );
        } finally {
            emitted.mockRestore();
        }
    });
});
