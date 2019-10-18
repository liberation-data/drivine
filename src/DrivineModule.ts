import { DrivineModuleBuilder } from '@/DrivineModuleBuilder';
import { DynamicModule, Global, Module, Provider, Type } from '@nestjs/common';
import { ConnectionProvider } from '@/connection/ConnectionProvider';

require('dotenv').config({
    path: process.env.DOTENV_CONFIG_PATH || require('find-config')('.env')
});

export interface DrivineModuleOptions {
    connectionProviders: ConnectionProvider[];
}

@Global()
@Module({})
export class DrivineModule implements DynamicModule {
    public readonly module: Type<any>;
    public readonly providers: Provider[];
    public readonly exports: Provider[];
    
    public static withOptions(options: DrivineModuleOptions): DynamicModule {
        return new DrivineModuleBuilder(options).build();
    }
}
