import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DrivineError } from '@/DrivineError';
import {
    FULL_FLOATS_PROBE,
    openSqlite,
    refuseCompiledCypherOn,
    ROUNDED_FLOATS_WARNING,
    RoundedFloats,
    SqliteDatabase,
    sqliteOlderThan,
    sqliteVersion
} from '@/connection/sqlite/SqliteDriver';

describe('a SQLite version', () => {
    it('should be read part by part, a missing part as 0', () => {
        expect(sqliteVersion('3.50.4')).toEqual([3, 50, 4]);
        expect(sqliteVersion('3.53.0')).toEqual([3, 53, 0]);
        expect(sqliteVersion('3.54.0')).toEqual([3, 54, 0]);
        expect(sqliteVersion('3.100.0')).toEqual([3, 100, 0]);
        expect(sqliteVersion('3.53')).toEqual([3, 53, 0]);
    });

    it('should be compared as numbers, not as text', () => {
        const minimum = [3, 53, 0];
        expect(sqliteOlderThan('3.50.4', minimum)).toBe(true);
        expect(sqliteOlderThan('3.52.9', minimum)).toBe(true);
        expect(sqliteOlderThan('3.53.0', minimum)).toBe(false);
        expect(sqliteOlderThan('3.54.0', minimum)).toBe(false);
        expect(sqliteOlderThan('3.100.0', minimum)).toBe(false);
        expect(sqliteOlderThan('4.0.0', minimum)).toBe(false);
        expect(sqliteOlderThan('2.99.99', minimum)).toBe(true);
    });

    it('should refuse a store before 3.45 as before, by major and minor alone', () => {
        expect(sqliteOlderThan('3.44.9', [3, 45, 0])).toBe(true);
        expect(sqliteOlderThan('3.45.0', [3, 45, 0])).toBe(false);
        expect(sqliteOlderThan('3.46.1', [3, 45, 0])).toBe(false);
    });

    it('should refuse compiled Cypher before 3.53, naming the SQLite, its Node and a Node to use', () => {
        expect(() => refuseCompiledCypherOn('3.52.9', '24.15.0')).toThrow(
            'Compiled Cypher needs SQLite 3.53 or later; this is SQLite 3.52.9, which Node 24.15.0 bundles. Use a ' +
                'Node release that bundles 3.53 or later: 22.23.4, 24.16.0, 26.1.0 or a later one of each line.'
        );
        expect(() => refuseCompiledCypherOn('3.46.1')).toThrow(DrivineError);
        expect(() => refuseCompiledCypherOn('3.50.4')).toThrow(/this is SQLite 3\.50\.4/);
        for (const version of ['3.53.0', '3.53.4', '3.54.0', '3.100.0']) {
            expect(() => refuseCompiledCypherOn(version)).not.toThrow();
        }
    });
});

describe('RoundedFloats', () => {
    const ROUNDED = () => '0.3';
    const FULL = () => '0.30000000000000004';

    it('should warn where SQLite writes 0.1 + 0.2 rounded, naming it, what it rounds, and Nodes that do not', () => {
        const emit = jest.fn();
        new RoundedFloats(emit).warnOnce('3.50.4', ROUNDED, '24.7.0');
        expect(emit).toHaveBeenCalledTimes(1);
        const [message, options] = emit.mock.calls[0];
        expect(options).toEqual({ code: 'DRIVINE_SQLITE_ROUNDED_FLOATS' });
        expect(message).toContain('SQLite 3.50.4, which Node 24.7.0 bundles');
        expect(message).toContain('fewer than 17 significant digits');
        expect(message).toContain('compiled Cypher');
        expect(message).toContain('stored rounded');
        expect(message).toContain('Node 22.23.4, 24.22.2 and 26.13 were measured to');
    });

    it('should warn of a SQLite 3.53 that still writes 15 digits, as a build may', () => {
        const emit = jest.fn();
        new RoundedFloats(emit).warnOnce('3.53.1', () => '0.300000000000000');
        expect(emit).toHaveBeenCalledTimes(1);
    });

    it('should say nothing where SQLite writes 17 digits, whatever its version', () => {
        const emit = jest.fn();
        expect(FULL()).toBe(FULL_FLOATS_PROBE);
        expect(Number(FULL_FLOATS_PROBE)).toBe(0.1 + 0.2);
        for (const version of ['3.52.0', '3.53.4', '3.54.0', '3.100.0']) {
            new RoundedFloats(emit).warnOnce(version, FULL);
        }
        expect(emit).not.toHaveBeenCalled();
    });

    it('should warn once, however many files are opened, and stop asking SQLite once it has', () => {
        const emit = jest.fn();
        const probe = jest.fn(ROUNDED);
        const floats = new RoundedFloats(emit);
        floats.warnOnce('3.50.4', probe);
        floats.warnOnce('3.50.4', probe);
        floats.warnOnce('3.45.0', probe);
        expect(emit).toHaveBeenCalledTimes(1);
        expect(probe).toHaveBeenCalledTimes(1);
    });

    it('should say nothing, and not throw, where asking SQLite fails, and ask again at the next file', () => {
        const emit = jest.fn();
        const probe = jest.fn(() => {
            throw new Error('no such function: json_quote');
        });
        const floats = new RoundedFloats(emit);
        expect(() => floats.warnOnce('3.50.4', probe)).not.toThrow();
        floats.warnOnce('3.50.4', ROUNDED);
        expect(probe).toHaveBeenCalledTimes(1);
        expect(emit).toHaveBeenCalledTimes(1);
    });

    it('should open a file SQLite can only read, asking it all the same', () => {
        const emitted = jest.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
        const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'drivine-sqlite-read-only-'));
        const file = path.join(folder, 'read-only.db');
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const written = new (require('node:sqlite').DatabaseSync)(file);
            written.exec('CREATE TABLE t (x)');
            written.close();
            fs.chmodSync(file, 0o444);
            jest.isolateModules(() => {
                // A fresh module, so this open is the first and asks SQLite.
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const db: SqliteDatabase = require('@/connection/sqlite/SqliteDriver').openSqlite(file);
                try {
                    const probe = String(db.prepare('SELECT json_quote(0.1 + 0.2) AS q').get()!.q);
                    const rounded = emitted.mock.calls.filter(
                        ([, options]) => (options as { code?: string })?.code === ROUNDED_FLOATS_WARNING
                    );
                    expect(rounded).toHaveLength(probe === FULL_FLOATS_PROBE ? 0 : 1);
                    if (process.getuid?.() !== 0) {
                        expect(() => db.exec('INSERT INTO t VALUES (1)')).toThrow(/readonly/);
                    }
                } finally {
                    db.close();
                }
            });
        } finally {
            emitted.mockRestore();
            if (fs.existsSync(file)) {
                fs.chmodSync(file, 0o644);
            }
            fs.rmSync(folder, { recursive: true, force: true });
        }
    });

    it('should give its warning as a Node process warning with its code, by default', () => {
        const emitted = jest.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
        try {
            new RoundedFloats().warnOnce('3.50.4', ROUNDED, '24.7.0');
            expect(emitted).toHaveBeenCalledTimes(1);
            expect(emitted.mock.calls[0][1]).toEqual({ code: ROUNDED_FLOATS_WARNING });
        } finally {
            emitted.mockRestore();
        }
    });

    it("should warn once of this Node's own SQLite as a process warning, and only where it rounds 0.1 + 0.2", () => {
        const emitted = jest.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
        const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'drivine-sqlite-version-'));
        try {
            const opened = [openSqlite(path.join(folder, 'a.db')), openSqlite(path.join(folder, 'b.db'))];
            const probe = String(opened[0].prepare('SELECT json_quote(0.1 + 0.2) AS q').get()!.q);
            opened.forEach((db) => db.close());
            const rounded = emitted.mock.calls.filter(
                ([, options]) => (options as { code?: string })?.code === ROUNDED_FLOATS_WARNING
            );
            expect(rounded).toHaveLength(probe === FULL_FLOATS_PROBE ? 0 : 1);
        } finally {
            emitted.mockRestore();
            fs.rmSync(folder, { recursive: true, force: true });
        }
    });
});
