import { inTestContext } from '@/test/TestContext';
import { StreamUtils } from '@/utils/StreamUtils';
import { RouteRepository } from './RouteRepository';
import { Route } from './Route';
import { Test, TestingModule } from '@nestjs/testing';
import { DrivineModule, DrivineModuleOptions } from '@/DrivineModule';
import { DatabaseRegistry } from '@/connection/DatabaseRegistry';
import { inDrivineContext } from '@/DrivineContext';

const fs = require('fs');

describe('RouteRepository', () => {
    let repo: RouteRepository;

    beforeAll(async () => {
        const app: TestingModule = await Test.createTestingModule({
            imports: [
                DrivineModule.withOptions(<DrivineModuleOptions>{
                    connectionProviders: [DatabaseRegistry.buildOrResolveFromEnv()]
                })
            ],
            providers: [RouteRepository],
            controllers: []
        }).compile();
        repo = app.get(RouteRepository);
    });

    it('should find routes between two cities, ordered by most expedient', async () => {
        return inDrivineContext(async () => {
            const results = await repo.findRoutesBetween('Cavite Island', 'NYC');
            expect(results.length).toBeGreaterThan(0);
            expect(results[0].travelTime).toEqual(26);
        });
    });

    it('should find the single fastest route between two cities', async () => {
        return inTestContext().run(async () => {
            const result = await repo.findFastestBetween('Cavite Island', 'NYC');
            expect(result).toBeDefined();
            expect(result.travelTime).toEqual(26);
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
