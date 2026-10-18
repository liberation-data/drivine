import { Injectable } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
    DatabaseRegistry,
    DrivineModule,
    DrivineModuleOptions,
    InjectGraphObjectManager,
    StatelessGraphObjectManager
} from '@liberation-data/drivine';

@Injectable()
class UsesObjectManagers {
    constructor(
        @InjectGraphObjectManager() readonly defaultManager: StatelessGraphObjectManager,
        @InjectGraphObjectManager('FALKORDB') readonly falkorManager: StatelessGraphObjectManager
    ) {}
}

// Requires the default (graph) and FALKORDB_* connections in .env.
describe('InjectGraphObjectManager', () => {
    let app: TestingModule;

    beforeAll(async () => {
        app = await Test.createTestingModule({
            imports: [
                DrivineModule.withOptions(<DrivineModuleOptions>{
                    connectionProviders: [
                        DatabaseRegistry.buildOrResolveFromEnv(),
                        DatabaseRegistry.buildOrResolveFromEnv('FALKORDB')
                    ]
                })
            ],
            providers: [UsesObjectManagers]
        }).compile();
    });

    afterAll(async () => {
        await app.close();
    });

    it('should inject an object manager per graph database', () => {
        const it = app.get(UsesObjectManagers);
        expect(it.defaultManager).toBeInstanceOf(StatelessGraphObjectManager);
        expect(it.defaultManager.database).toEqual('default');
        expect(it.falkorManager.database).toEqual('FALKORDB');
    });
});
