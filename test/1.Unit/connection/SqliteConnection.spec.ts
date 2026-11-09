import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DrivineError } from '@/DrivineError';
import { DatabaseType } from '@/connection/DatabaseType';
import { PostgresResultMapper } from '@/connection/postgres/PostgresResultMapper';
import { SqliteConnection } from '@/connection/sqlite/SqliteConnection';
import { SqliteConnectionProvider } from '@/connection/sqlite/SqliteConnectionProvider';
import { openSqlite, SqliteDatabase, sqliteOlderThan, sqliteVersionOf } from '@/connection/sqlite/SqliteDriver';
import { SqliteFunctions } from '@/connection/sqlite/SqliteFunctions';
import { QuerySpecification } from '@/query/QuerySpecification';
import { cypherStatement } from '@/query/Statement';

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

    it('should be refused on a SQLite before 3.53, naming it and its Node, while plain SQL still runs', async () => {
        const emitted = jest.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
        const db = openSqlite(path.join(folder, 'old.db'));
        try {
            const old = connection(db, '3.50.4');
            const refused = old.query(new QuerySpecification(cypherStatement('RETURN 1 + 1')));
            await expect(refused).rejects.toBeInstanceOf(DrivineError);
            await expect(refused).rejects.toThrow(
                `Compiled Cypher needs SQLite 3.53 or later; this is SQLite 3.50.4, which Node ` +
                    `${process.versions.node} bundles. Use a Node release that bundles 3.53 or later`
            );
            expect(await old.query(new QuerySpecification('SELECT 1 + 1 AS two'))).toEqual([{ two: 2 }]);
            expect(await connection(db, '3.46.1').query(new QuerySpecification('SELECT 3 AS three'))).toEqual([
                { three: 3 }
            ]);
            await expect(
                connection(db, '3.52.9').query(new QuerySpecification(cypherStatement('RETURN 1')))
            ).rejects.toThrow(/this is SQLite 3\.52\.9/);
        } finally {
            db.close();
            emitted.mockRestore();
        }
    });

    it('should compile on the SQLite Node bundles, as before, where it is 3.53 or later', async () => {
        const emitted = jest.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
        const db = openSqlite(path.join(folder, 'real.db'));
        try {
            SqliteFunctions.register(db);
            const version = sqliteVersionOf(db);
            const query = connection(db).query(new QuerySpecification(cypherStatement('RETURN last([1, 2, 3])')));
            if (sqliteOlderThan(version, [3, 53, 0])) {
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
            if (sqliteOlderThan(version, [3, 53, 0])) {
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
});
