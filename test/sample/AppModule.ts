import { Module } from '@nestjs/common';
import { DrivineModule, DrivineModuleOptions } from '@liberation-data/drivine';
import { HealthModule } from './health/HealthModule';
import { TrafficModule } from './traffic/TrafficModule';
import { ConnectionProviderRegistry } from '@/connection/ConnectionProviderRegistry';

@Module({
    imports: [
        DrivineModule.withOptions(<DrivineModuleOptions>{
            connectionProviders: [
                ConnectionProviderRegistry.buildOrResolveFromEnv()
            ]
        }),
        HealthModule,
        TrafficModule
    ],
    controllers: [],
    providers: []
})
export class AppModule {
}
