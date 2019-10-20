import { DrivineModuleBuilder } from '@/DrivineModuleBuilder';
import { DynamicModule, Global, Logger, MiddlewareConsumer, Module, NestModule, Provider, Type } from "@nestjs/common";
import { ConnectionProvider } from '@/connection/ConnectionProvider';
import { TransactionContextMiddleware } from "@/transaction/TransactionContextMIddleware";

require('dotenv').config({
    path: process.env.DOTENV_CONFIG_PATH || require('find-config')('.env')
});

export interface DrivineModuleOptions {
    connectionProviders: ConnectionProvider[];
}

@Global()
@Module({})
export class DrivineModule implements DynamicModule {

    public readonly module: Type<DrivineModule>;
    public readonly providers: Provider[];
    public readonly exports: Provider[];

    private logger = new Logger(DrivineModule.name);

    public static withOptions(options: DrivineModuleOptions): DynamicModule {
        return new DrivineModuleBuilder(options).build();
    }

}
