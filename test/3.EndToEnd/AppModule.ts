import { ClassSerializerInterceptor, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { RouteRepository } from '../2.Integration/RouteRepository';
import { Reflector } from '@nestjs/core';
import { RouteController } from './RouteController';
import { DrivineModule, DrivineModuleOptions, DatabaseRegistry } from '@liberation-data/drivine';
import { MovieRepository } from '../2.Integration/MovieRepository';

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
    providers: [RouteRepository, MovieRepository],
    controllers: [RouteController]
})
export class AppModule {}
