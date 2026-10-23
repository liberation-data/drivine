import { Test, TestingModule } from '@nestjs/testing';
import {
    DatabaseRegistry,
    rangeIndex,
    SchemaCatalog,
    SchemaManager,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';
import { DrivineModule, DrivineModuleOptions, InjectGraphObjectManager } from '@liberation-data/drivine/nest';
import { Injectable } from '@nestjs/common';

// Schema DDL on Neo4j waits on schema locks other suites hold while they run in parallel.
jest.setTimeout(30_000);

@Injectable()
class UsesSchema {
    constructor(
        readonly schema: SchemaManager,
        @InjectGraphObjectManager() readonly gom: StatelessGraphObjectManager
    ) {}
}

// Requires the default (graph) connection in .env.
describe('DrivineModule with a schema', () => {
    let app: TestingModule;
    const spec = rangeIndex('ModuleSchemaDoc', 'slug');

    beforeAll(async () => {
        app = await Test.createTestingModule({
            imports: [
                DrivineModule.withOptions(<DrivineModuleOptions>{
                    connectionProviders: [DatabaseRegistry.buildOrResolveFromEnv()],
                    schema: { catalogs: [SchemaCatalog.of(spec)] }
                })
            ],
            providers: [UsesSchema]
        }).compile();
    });

    afterAll(async () => {
        await app.get(UsesSchema).gom.indexes.drop(spec);
        await app.close();
    });

    it('should enforce the schema at startup, and inject the SchemaManager', async () => {
        const it = app.get(UsesSchema);
        expect(it.schema).toBeInstanceOf(SchemaManager);
        expect((await it.gom.indexes.list()).some((index) => index.label === 'ModuleSchemaDoc')).toBe(true);
    });
});

// Requires the default (graph) connection in .env.
describe('DrivineModule with a schema known only at runtime', () => {
    let app: TestingModule;
    const spec = rangeIndex('ModuleRuntimeDoc', 'slug');

    beforeAll(async () => {
        DatabaseRegistry.tearDown(); // the first module's close ended its connection
        app = await Test.createTestingModule({
            imports: [
                DrivineModule.withOptions(<DrivineModuleOptions>{
                    connectionProviders: [DatabaseRegistry.buildOrResolveFromEnv()],
                    schema: { catalogs: [] }
                })
            ],
            providers: [UsesSchema]
        }).compile();
    });

    afterAll(async () => {
        await app.get(UsesSchema).gom.indexes.drop(spec);
        await app.close();
    });

    it('should inject a SchemaManager given no catalogs, to ensure schema with', async () => {
        const it = app.get(UsesSchema);
        await it.schema.ensure('runtime-module', spec);
        expect((await it.gom.indexes.list()).some((index) => index.label === 'ModuleRuntimeDoc')).toBe(true);
    });
});
