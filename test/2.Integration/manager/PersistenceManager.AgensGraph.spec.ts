import { inTestContext } from "@/test/TestContext";
import { HealthRepository } from "./HealthRepository";
import { Test, TestingModule } from "@nestjs/testing";
import { DrivineModule, DrivineModuleOptions } from "@/DrivineModule";
import { ConnectionProviderRegistry } from "@/connection/ConnectionProviderRegistry";
import { RouteRepository } from "./RouteRepository";
import { Route } from "./Route";
import { StreamUtils } from "@/utils/StreamUtils";
const fs = require("fs");

describe("PersistenceManager", () => {

    let healthRepo: HealthRepository;
    let routeRepo: RouteRepository;

    beforeAll(async () => {
        const app: TestingModule = await Test.createTestingModule({
            imports: [
                DrivineModule.withOptions(<DrivineModuleOptions>{
                    connectionProviders: [
                        ConnectionProviderRegistry.buildOrResolveFromEnv('1')]
                })
            ],
            providers: [HealthRepository, RouteRepository],
            controllers: []
        }).compile();
        healthRepo = app.get(HealthRepository);
        routeRepo = app.get(RouteRepository);
    });

    describe('NonTransactionalPersistenceManager', () => {

        it("should count all nodes using HealthRepository", async () => {
            return inTestContext().run(async () => {
                const results = await healthRepo.countAllVertices();
                expect(results).toBeGreaterThan(0);
                console.log(`Got results: ${results}`);
            });
        });

    });

    describe('TransactionalPersistenceManager', () => {

        it('should find routes between two cities, ordered by most expedient', async () => {
            return inTestContext().run(async () => {
                const results = await routeRepo.findRoutesBetween('Cavite Island', 'NYC');
                expect(results.length).toBeGreaterThan(0);
                expect(results[0].travelTime).toEqual(26);
            });
        });

        it('should find the single fastest route between two cities', async () => {
            return inTestContext().run(async () => {
                const result = await routeRepo.findFastestBetween('Cavite Island', 'NYC');
                expect(result).toBeDefined();
                expect(result.travelTime).toEqual(26);
            });
        });

        it("should find routes between two cities, returning an async iterable cursor", async () => {
            return inTestContext().run(async () => {
                const cursor = await routeRepo.asyncRoutesBetween("Cavite Island", "NYC");
                for await (const item of cursor) {
                    expect(item.travelTime).toBeGreaterThan(0);
                    expect(item.metros.length).toBeGreaterThan(0);
                    expect(item).toBeInstanceOf(Route);
                }

                const fileStream = fs.createWriteStream("routes.txt", { flags: "w" });
                const cursor2 = await routeRepo.asyncRoutesBetween("Cavite Island", "NYC");
                cursor2.asStream({ transform: route => route.toString() }).pipe(fileStream);
                await StreamUtils.untilClosed(fileStream);
            });
        });

    });

});
