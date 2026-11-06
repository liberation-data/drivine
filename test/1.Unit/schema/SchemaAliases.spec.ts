import { OracleGraph } from '@/backend/oracle/OracleGraph';
import { OracleSchemaGrammar } from '@/backend/oracle/OracleSchemaGrammar';
import { PostgresGraph } from '@/backend/postgres/PostgresGraph';
import { PostgresSchemaGrammar } from '@/backend/postgres/PostgresSchemaGrammar';
import { aliasesJson, withAliases } from '@/backend/sql/SqlCatalog';
import { SqliteGraph } from '@/backend/sqlite/SqliteGraph';
import { SqliteSchemaGrammar } from '@/backend/sqlite/SqliteSchemaGrammar';
import { ConnectionProvider } from '@/connection/ConnectionProvider';
import { DatabaseRegistry } from '@/connection/DatabaseRegistry';
import { DatabaseType } from '@/connection/DatabaseType';
import { PersistenceManagerFactory } from '@/manager/PersistenceManagerFactory';
import { NEO4J_SCHEMA } from '@/schema/SchemaGrammar';
import { TransactionContextHolder } from '@/transaction/TransactonContextHolder';

/** The aliases a SQL store keeps of an item, among its catalog record's details, as drivine4j keeps them. */
describe('Schema aliases', () => {
    const item = { label: 'Person', properties: ['name'] };

    it('are written as the JSON array drivine4j writes, byte for byte', () => {
        expect(aliasesJson(['by_name', 'a "quoted" \\ name', 'tab\there'])).toEqual(
            '["by_name","a \\"quoted\\" \\\\ name","tab\\u0009here"]'
        );
    });

    it("are read from a record's details, and are absent where there are none", () => {
        expect(withAliases({ aliases: ['a', 'b'] })).toEqual({ aliases: ['a', 'b'] });
        expect(withAliases({ aliases: [] })).toEqual({});
        expect(withAliases({ labelled: 'x' })).toEqual({});
        expect(withAliases(undefined)).toEqual({});
    });

    it('are recorded on Postgres by an UPDATE of the record, which recording it again keeps', () => {
        const grammar = new PostgresSchemaGrammar(new PostgresGraph('g'));
        expect(grammar.aliased('RANGE', item, ['by_name'])).toEqual(
            `UPDATE g_schema SET details = jsonb_set(details, '{aliases}', CAST('["by_name"]' AS jsonb)) ` +
                `WHERE kind = 'RANGE_INDEX' AND label = 'Person' AND properties = '["name"]'`
        );
        expect(grammar.aliased('UNIQUE', item, [])).toEqual(
            `UPDATE g_schema SET details = details - 'aliases' ` +
                `WHERE kind = 'UNIQUENESS_CONSTRAINT' AND label = 'Person' AND properties = '["name"]'`
        );
        expect(grammar.createRange({ kind: 'RANGE', ...item }).join('\n')).toContain('DO NOTHING');
    });

    it('are recorded on SQLite by json_set, and taken out by json_remove', () => {
        const grammar = new SqliteSchemaGrammar(new SqliteGraph('g'));
        expect(grammar.aliased('RANGE', item, ['by_name'])).toEqual(
            `UPDATE g_schema SET details = json_set(details, '$.aliases', json('["by_name"]')) ` +
                `WHERE kind = 'RANGE_INDEX' AND label = 'Person' AND properties = '["name"]'`
        );
        expect(grammar.aliased('RANGE', item, [])).toContain(`json_remove(details, '$.aliases')`);
    });

    it('are recorded on Oracle by a merge patch, which a range index recorded again merges with too', () => {
        const grammar = new OracleSchemaGrammar(new OracleGraph('g'));
        expect(grammar.aliased('VECTOR', { label: 'Chunk', properties: ['embedding'] }, ['e'])).toEqual(
            `UPDATE g_schema SET details = JSON_MERGEPATCH(details, '{"aliases": ["e"]}') ` +
                `WHERE kind = 'VECTOR_INDEX' AND label = 'Chunk' AND properties = '["embedding"]'`
        );
        expect(grammar.aliased('RANGE', item, [])).toContain(`JSON_MERGEPATCH(details, '{"aliases": null}')`);
        const range = grammar.createRange({ kind: 'RANGE', ...item }).join('\n');
        expect(range).toMatch(
            /WHEN MATCHED THEN UPDATE SET c\.details = JSON_MERGEPATCH\(c\.details, '\{"labelled": "[^"]+", "unique": null\}'\)/
        );
        const unique = grammar.createUnique({ kind: 'UNIQUE', ...item }).join('\n');
        expect(unique).toMatch(/SET details = JSON_MERGEPATCH\(details, '\{"unique": "[^"]+", "labelled": null\}'\)/);
    });

    it('are kept by no graph engine', () => {
        expect(NEO4J_SCHEMA.aliased).toBeUndefined();
    });
});

describe('Schema commands', () => {
    afterEach(() => DatabaseRegistry.tearDown());

    const provider = (name: string, type: DatabaseType): ConnectionProvider => ({
        name,
        type,
        connect: async () => Promise.reject(new Error('no connection in a unit test')),
        end: async () => Promise.resolve()
    });

    it("are one database's whether its manager is asked for as 'default' or by the database's name", () => {
        const registry = DatabaseRegistry.getInstance();
        registry.register(provider('users', DatabaseType.POSTGRES));
        registry.register(provider('graph', DatabaseType.NEO4J));
        const factory = new PersistenceManagerFactory(registry, TransactionContextHolder.getInstance());
        const commands = (name: string): unknown => (factory.get(name, 'NON_TRANSACTIONAL') as any).schemaCommands;

        expect(commands('default')).toBeDefined();
        expect(commands('default')).toBe(commands('users'));
        expect((commands('users') as any).database).toEqual('users');
        expect(commands('graph')).toBeUndefined();
    });
});
