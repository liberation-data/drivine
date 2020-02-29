import { ClassSerializerInterceptor, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { DrivineModule, DrivineModuleOptions, TestConfig } from '@/DrivineModule';
import { DatabaseRegistry } from '@/connection/DatabaseRegistry';
import { RouteRepository } from '../2.Integration/manager/RouteRepository';
import { Reflector } from '@nestjs/core';
import { RouteController } from './RouteController';

export async function configureApp(app: INestApplication): Promise<void> {
    app.useGlobalPipes(
        new ValidationPipe({
            transform: true,
            whitelist: true
        })
    );
    app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
    return Promise.resolve();
}

@Module({
    imports: [
        DrivineModule.withOptions(<DrivineModuleOptions>{
            connectionProviders: [
                DatabaseRegistry.buildOrResolveFromEnv('NEO'),
                DatabaseRegistry.buildOrResolveFromEnv('TRAFFIC')
            ],
            testConfig: <TestConfig>{
                jest: true
            }
        })
    ],
    providers: [RouteRepository],
    controllers: [RouteController]
})
export class AppModule {

}
