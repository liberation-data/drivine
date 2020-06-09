import { ClassSerializerInterceptor, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DrivineModule, DrivineModuleOptions, DatabaseRegistry } from '@liberation-data/drivine';

const before = DrivineModule.withOptions(<DrivineModuleOptions>{connectionProviders: [ DatabaseRegistry.buildOrResolveFromEnv()]}); // REMOVE ME AFTER FIX ;) 

import { DbModule } from './db.module'; // <<< Move this after RouteRepository import and it will work
import { RouteRepository } from '../2.Integration/RouteRepository';

const after = DrivineModule.withOptions(<DrivineModuleOptions>{connectionProviders: [ DatabaseRegistry.buildOrResolveFromEnv()]}) // REMOVE ME AFTER FIX ;) 
console.log('providers BEFORE RouteRepository import', before.providers); // REMOVE ME AFTER FIX ;) 
console.log('providers AFTER RouteRepository import', after.providers); // REMOVE ME AFTER FIX ;) 

import { RouteController } from './route.controller';

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
    imports: [DbModule],
    providers: [RouteRepository],
    controllers: [RouteController]
})
export class AppModule { }
