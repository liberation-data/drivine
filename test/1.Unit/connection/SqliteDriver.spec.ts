import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    FULL_FLOATS_SQLITE,
    openSqlite,
    RoundedFloats,
    sqliteOlderThan,
    sqliteVersion
} from '@/connection/sqlite/SqliteDriver';
import { DrivineLogger } from '@/logger';

describe('a SQLite version', () => {
    it('should be read part by part, a missing part as 0', () => {
        expect(sqliteVersion('3.50.4')).toEqual([3, 50, 4]);
        expect(sqliteVersion('3.53.0')).toEqual([3, 53, 0]);
        expect(sqliteVersion('3.54.0')).toEqual([3, 54, 0]);
        expect(sqliteVersion('3.100.0')).toEqual([3, 100, 0]);
        expect(sqliteVersion('3.53')).toEqual([3, 53, 0]);
    });

    it('should be compared as numbers, not as text', () => {
        expect(sqliteOlderThan('3.50.4', FULL_FLOATS_SQLITE)).toBe(true);
        expect(sqliteOlderThan('3.52.9', FULL_FLOATS_SQLITE)).toBe(true);
        expect(sqliteOlderThan('3.53.0', FULL_FLOATS_SQLITE)).toBe(false);
        expect(sqliteOlderThan('3.54.0', FULL_FLOATS_SQLITE)).toBe(false);
        expect(sqliteOlderThan('3.100.0', FULL_FLOATS_SQLITE)).toBe(false);
        expect(sqliteOlderThan('4.0.0', FULL_FLOATS_SQLITE)).toBe(false);
        expect(sqliteOlderThan('2.99.99', FULL_FLOATS_SQLITE)).toBe(true);
    });
});

describe('RoundedFloats', () => {
    type Logged = { it: DrivineLogger; warn: jest.SpyInstance };
    const logger = (): Logged => {
        const it = new DrivineLogger('test');
        const warn = jest.spyOn(it, 'warn').mockImplementation(() => undefined);
        return { it, warn };
    };

    it('should warn of a SQLite before 3.53, naming it, what it rounds, and the Nodes that bring a later one', () => {
        const { it, warn }: Logged = logger();
        new RoundedFloats(it).warnOnce('3.50.4', '24.7.0');
        expect(warn).toHaveBeenCalledTimes(1);
        const message = warn.mock.calls[0][0] as string;
        expect(message).toContain('SQLite 3.50.4, which Node 24.7.0 bundles');
        expect(message).toContain('15 significant digits');
        expect(message).toContain('compiled Cypher');
        expect(message).toContain('stored rounded');
        expect(message).toContain('Node 22.23 or later, 24.22 or later, or 26');
    });

    it('should say nothing of SQLite 3.53 or later', () => {
        const { it, warn }: Logged = logger();
        for (const version of ['3.53.0', '3.54.0', '3.100.0']) {
            new RoundedFloats(it).warnOnce(version);
        }
        expect(warn).not.toHaveBeenCalled();
    });

    it('should warn once, however many files are opened', () => {
        const { it, warn }: Logged = logger();
        const floats = new RoundedFloats(it);
        floats.warnOnce('3.50.4');
        floats.warnOnce('3.50.4');
        floats.warnOnce('3.45.0');
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it("should warn once of this Node's own SQLite when a file is opened, and only where it is before 3.53", () => {
        const warn = jest.spyOn(DrivineLogger.prototype, 'warn').mockImplementation(() => undefined);
        const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'drivine-sqlite-version-'));
        try {
            const opened = [openSqlite(path.join(folder, 'a.db')), openSqlite(path.join(folder, 'b.db'))];
            const version = String(opened[0].prepare('SELECT sqlite_version() AS v').get()!.v);
            opened.forEach((db) => db.close());
            const rounded = warn.mock.calls.filter(([message]) => String(message).includes('15 significant digits'));
            expect(rounded).toHaveLength(sqliteOlderThan(version, FULL_FLOATS_SQLITE) ? 1 : 0);
        } finally {
            warn.mockRestore();
            fs.rmSync(folder, { recursive: true, force: true });
        }
    });
});
