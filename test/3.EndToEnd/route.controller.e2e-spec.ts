import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { HttpStatus, INestApplication } from '@nestjs/common';
import { AppModule, configureApp } from './app.module';

describe('RouteController (e2e)', () => {
    let app: INestApplication;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule]
        }).compile();

        app = moduleFixture.createNestApplication();
        await configureApp(app);
        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    describe('GET /routes/between', () => {
        it('should list routes between start and dest, ordered by travel time', async () => {
            const result = await request(app.getHttpServer()).get('/routes/between/Pigalle/NYC').expect(HttpStatus.OK);

            expect(result.body.length).toBeGreaterThan(0);
            expect(result.body[0].travelTime).toEqual(8.5);
        });
    });

    describe('GET /routes/fastest/between', () => {
        it('should return the fastest route between start and dest ', async () => {
            const result = await request(app.getHttpServer()).get('/routes/between/Pigalle/NYC').expect(HttpStatus.OK);

            expect(result.body[0].travelTime).toEqual(8.5);
        });
    });
});
