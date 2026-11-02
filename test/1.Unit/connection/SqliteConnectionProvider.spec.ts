import { DatabaseRegistry, DatabaseType, QuerySpecification, SqliteConnectionProvider } from '@liberation-data/drivine';
import { ConnectionPropertiesFromEnv } from '@/connection/ConnectionProperties';
import { SqliteSpecCompiler } from '@/connection/sqlite/SqliteSpecCompiler';
import { DrivineLogger } from '@/logger';

describe('a SQLite connection provider', () => {
    afterEach(() => DatabaseRegistry.tearDown());

    it('should be built from properties with the database name as the path of the file, and no host', () => {
        const warn = jest.spyOn(DrivineLogger.prototype, 'warn').mockImplementation(() => undefined);
        try {
            const provider = DatabaseRegistry.getInstance()
                .builder()
                .withProperties({
                    databaseType: DatabaseType.SQLITE,
                    host: 'ignored',
                    databaseName: '/tmp/graph.db',
                    defaultGraphPath: 'contracts'
                })
                .register('sqlite') as SqliteConnectionProvider;
            expect(provider).toBeInstanceOf(SqliteConnectionProvider);
            expect(provider.path).toEqual('/tmp/graph.db');
            expect(provider.graphName).toEqual('contracts');
            expect(warn).toHaveBeenCalledWith(expect.stringContaining("the host 'ignored'"));
        } finally {
            warn.mockRestore();
        }
    });

    it('should need the path of a file, and refuse a database in memory', () => {
        const builder = (databaseName?: string) =>
            DatabaseRegistry.getInstance()
                .builder()
                .withProperties({ databaseType: DatabaseType.SQLITE, host: '', databaseName });
        expect(() => builder().register('none')).toThrow(/path of the database file/);
        expect(() => builder(':memory:').register('memory')).toThrow(/names no file/);
        expect(() => builder('file:x?mode=memory').register('memory2')).toThrow(/names no file/);
    });

    it('should read a SQLite datasource from the environment without a host', () => {
        process.env.LITE_DATABASE_TYPE = 'SQLITE';
        process.env.LITE_DATABASE_NAME = 'graph.db';
        try {
            expect(ConnectionPropertiesFromEnv('LITE')).toMatchObject({
                databaseType: 'SQLITE',
                databaseName: 'graph.db'
            });
        } finally {
            delete process.env.LITE_DATABASE_TYPE;
            delete process.env.LITE_DATABASE_NAME;
        }
    });
});

describe('SqliteSpecCompiler', () => {
    const compiled = (spec: QuerySpecification<any>): { statement: string; parameters: any } =>
        new SqliteSpecCompiler(spec.finalizedCopy('SQL')).compile();

    it('should bind only the names the statement uses, each as SQLite holds it', () => {
        const spec = new QuerySpecification('SELECT $id, $idList, $at, $flag, $list').bind({
            id: 1,
            idList: 'x',
            at: new Date('2026-01-01T00:00:00.000Z'),
            flag: true,
            list: [1, 'a'],
            unused: 2
        });
        expect(compiled(spec).parameters).toEqual({
            id: 1,
            idList: 'x',
            at: '2026-01-01T00:00:00.000Z',
            flag: 1,
            list: '[1,"a"]'
        });
    });

    it('should bind a number a statement reads only as text as JSON writes it, not as the real node:sqlite binds', () => {
        const spec = new QuerySpecification(
            'SELECT CAST($id AS TEXT), CAST($both AS TEXT), $both, CAST($big AS TEXT)'
        ).bind({
            id: 7,
            both: 7,
            big: 1e21
        });
        expect(compiled(spec).parameters).toEqual({ id: '7', both: 7, big: '1e+21' });
    });

    it('should page with LIMIT and OFFSET, an offset with no limit reading the rest', () => {
        expect(compiled(new QuerySpecification('SELECT 1').skip(5)).statement).toEqual('SELECT 1 LIMIT -1 OFFSET 5');
        expect(compiled(new QuerySpecification('SELECT 1').limit(3)).statement).toEqual('SELECT 1 LIMIT 3');
        expect(compiled(new QuerySpecification('SELECT 1').skip(5).limit(3)).statement).toEqual(
            'SELECT 1 LIMIT 3 OFFSET 5'
        );
    });

    it('should refuse Cypher, whose compiler for SQLite comes later', () => {
        const cypher = new QuerySpecification({ text: 'MATCH (n) RETURN n', language: 'CYPHER' });
        expect(() => new SqliteSpecCompiler(cypher)).toThrow(/CYPHER is not run on SQLite/);
    });
});
