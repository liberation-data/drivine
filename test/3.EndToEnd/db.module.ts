import { Module } from '@nestjs/common';
import { DrivineModule, DrivineModuleOptions, DatabaseRegistry } from '@liberation-data/drivine';

@Module({
    imports: [
        DrivineModule.withOptions(<DrivineModuleOptions>{
            connectionProviders: [
                DatabaseRegistry.buildOrResolveFromEnv(),
                DatabaseRegistry.buildOrResolveFromEnv('TRAFFIC')
            ]
        })
    ],
})
export class DbModule {}




