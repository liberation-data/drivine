import {
    ClassSerializerInterceptor,
    INestApplication,
    MiddlewareConsumer,
    Module,
    NestModule,
    ValidationPipe
} from "@nestjs/common";
import { DrivineModule, DrivineModuleOptions } from "@/DrivineModule";
import { ConnectionProviderRegistry } from "@/connection/ConnectionProviderRegistry";
import { HealthRepository } from "../2.Integration/manager/HealthRepository";
import { RouteRepository } from "../2.Integration/manager/RouteRepository";
import { Reflector } from "@nestjs/core";
import { RouteController } from "./RouteController";
import { TransactionContextMiddleware } from "@/transaction/TransactionContextMIddleware";

export async function configureApp(app: INestApplication): Promise<void> {
    app.useGlobalPipes(
        new ValidationPipe({
            transform: true,
            whitelist: true
        })
    );
    app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
}

@Module({
    imports: [
        DrivineModule.withOptions(<DrivineModuleOptions>{
            connectionProviders: [ConnectionProviderRegistry.buildOrResolveFromEnv()]
        }),
    ],
    providers: [RouteRepository],
    controllers: [RouteController],
})
export class AppModule implements NestModule {

    public configure(consumer: MiddlewareConsumer): any {
        consumer.apply(TransactionContextMiddleware).forRoutes('**/**');
    }
}
