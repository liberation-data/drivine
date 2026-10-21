import { ClassSerializerInterceptor, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { RouteRepository } from '../2.Integration/RouteRepository';
import { Reflector } from '@nestjs/core';
import { RouteController } from './RouteController';
import { DatabaseRegistry } from '@liberation-data/drivine';
import { DrivineModule, DrivineModuleOptions } from '@liberation-data/drivine/nest';

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
                DatabaseRegistry.buildOrResolveFromEnv(),
                DatabaseRegistry.buildOrResolveFromEnv('TRAFFIC')
            ]
        })
    ],
    providers: [RouteRepository],
    controllers: [RouteController]
})
export class AppModule {}
