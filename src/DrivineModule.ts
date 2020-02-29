import { DrivineModuleBuilder } from '@/DrivineModuleBuilder';
import { DynamicModule, Global, Module, OnModuleDestroy, Provider, Type } from '@nestjs/common';
import { ConnectionProvider } from '@/connection/ConnectionProvider';
import { DatabaseRegistry } from '@/connection/DatabaseRegistry';

require('dotenv').config({
    path: process.env.DOTENV_CONFIG_PATH || require('find-config')('.env')
});

export interface DrivineModuleOptions {
    connectionProviders: ConnectionProvider[];
}

@Global()
@Module({})
export class DrivineModule implements DynamicModule, OnModuleDestroy {
    readonly module: Type<DrivineModule>;
    readonly providers: Provider[];
    readonly exports: Provider[];

    static withOptions(options: DrivineModuleOptions): DynamicModule {
        const builder = new DrivineModuleBuilder(options);
        return <DynamicModule>{
            module: DrivineModule,
            providers: builder.providers,
            exports: builder.providers
        };
    }

    constructor(readonly registry: DatabaseRegistry) {}

    async onModuleDestroy(): Promise<any> {
        await Promise.all(this.registry.providers.map(async it => it.end()));
    }
}
