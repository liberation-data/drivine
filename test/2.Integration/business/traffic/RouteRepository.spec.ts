import { inTestContext } from '@/test/TestContext';
import { StreamUtils } from '@/utils/StreamUtils';
import { RouteRepository } from '../../../sample/traffic/RouteRepository';
import { Route } from '../../../sample/traffic/Route';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../../sample/AppModule';

const fs = require('fs');

describe('RouteRepository', () => {
    let repo: RouteRepository;

    beforeAll(async () => {
        const app: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
            providers: [RouteRepository],
            controllers: []
        }).compile();
        repo = app.get(RouteRepository);
    });

    it('should find routes between two cities, ordered by most expedient', async () => {
        return inTestContext().run(async () => {
            const results = await repo.findRoutesBetween('Cavite Island', 'NYC');
            expect(results.length).toBeGreaterThan(0);
            expect(results[0].travelTime).toEqual(26);
        });
    });

    it('should find routes between two cities, returning an async iterable cursor', async () => {
        return inTestContext().run(async () => {
            const cursor = await repo.asyncRoutesBetween('Cavite Island', 'NYC');
            for await (const item of cursor) {
                expect(item.travelTime).toBeGreaterThan(0);
                expect(item.metros.length).toBeGreaterThan(0);
                expect(item).toBeInstanceOf(Route);
            }

            const fileStream = fs.createWriteStream('routes.txt', { flags: 'w' });
            const cursor2 = await repo.asyncRoutesBetween('Cavite Island', 'NYC');
            cursor2.asStream({ transform: route => route.toString() }).pipe(fileStream);
            await StreamUtils.untilClosed(fileStream);
        });
    });
});
