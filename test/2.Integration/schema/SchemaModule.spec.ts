import { Test, TestingModule } from '@nestjs/testing';
import {
    DatabaseRegistry,
    DrivineModule,
    DrivineModuleOptions,
    InjectGraphObjectManager,
    rangeIndex,
    SchemaCatalog,
    SchemaManager,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';
import { Injectable } from '@nestjs/common';

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
