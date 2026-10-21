import '@/Environment';
import { DrivineModuleBuilder } from '@/nest/DrivineModuleBuilder';
import {
    DynamicModule,
    Global,
    MiddlewareConsumer,
    Module,
    NestModule,
    OnModuleDestroy,
    Provider,
    Type
} from '@nestjs/common';
import { ConnectionProvider } from '@/connection/ConnectionProvider';
import { DatabaseRegistry } from '@/connection/DatabaseRegistry';
import { TransactionContextMiddleware } from '@/nest/TransactionContextMiddleware';
import { TransactionContextHolder } from '@/transaction';
import { SchemaOptions } from '@/schema/SchemaManager';
import { QueryOptions } from '@/manager/GraphObjectManagerFactory';

export interface DrivineModuleOptions {
    connectionProviders: ConnectionProvider[];
    /** Indexes and constraints to hold, enforced at startup (see SchemaManager), and injectable as SchemaManager. */
    schema?: SchemaOptions;
    /** How the object managers treat queries, e.g. `{ indexAdvice: 'FAIL' }` in development or CI. */
    query?: QueryOptions;
}

@Global()
@Module({})
export class DrivineModule implements DynamicModule, NestModule, OnModuleDestroy {
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

    static tearDownStaticData(): void {
        TransactionContextHolder.tearDown();
        DatabaseRegistry.tearDown();
    }

    constructor(readonly registry: DatabaseRegistry) {}

    configure(consumer: MiddlewareConsumer): any {
        consumer.apply(TransactionContextMiddleware).forRoutes('');
    }

    async onModuleDestroy(): Promise<any> {
        await Promise.all(this.registry.providers.map(async (it) => it.end()));
    }
}
