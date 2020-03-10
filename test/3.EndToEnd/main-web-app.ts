import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './AppModule';
import { ClassSerializerInterceptor, INestApplication, Logger, ValidationPipe } from '@nestjs/common';

require('dotenv').config({ path: require('find-config')('.env') });

const logger = new Logger('main');

export async function createApp(): Promise<INestApplication> {
    return NestFactory.create(AppModule);
}

export async function configureApp(app: INestApplication): Promise<void> {
    app.useGlobalPipes(
        new ValidationPipe({
            transform: true,
            whitelist: true
        })
    );

    app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

    if (require.main === module) {
        const port = process.env.SERVER_PORT || 3000;
        logger.log(`Starting server on port: ${port}`);
        await app.listen(port);
    }
}

createApp()
    .then(async app => configureApp(app))
    .then(() => logger.log(`Bootstrap configuration complete.`))
    .catch(e => {
        throw e;
    });
