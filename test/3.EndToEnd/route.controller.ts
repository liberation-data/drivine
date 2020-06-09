import { Controller, Get, Param } from '@nestjs/common';
import { RouteRepository } from '../2.Integration/RouteRepository';
import { Route } from '../2.Integration/models/Route';

export interface RecommendedRouteDto {
    start: string;
    destination: string;
    via: string[];
    travelTime: number;
}

@Controller('/routes')
export class RouteController {
    constructor(readonly routeRepository: RouteRepository) {}

    @Get('/between/:start/:dest')
    async routeBetween(@Param('start') start: string, @Param('dest') dest: string): Promise<RecommendedRouteDto[]> {
        const routes = await this.routeRepository.findRoutesBetween(start, dest);
        return routes.map(
            (it: Route): RecommendedRouteDto => ({
                start: it.start,
                destination: it.destination,
                via: it.intermediateMetros(),
                travelTime: it.travelTime
            })
        );
    }

    @Get('/fastest/between/:start/:dest')
    async fastestBetween(@Param('start') start: string, @Param('dest') dest: string): Promise<RecommendedRouteDto> {
        const route = await this.routeRepository.findFastestBetween(start, dest);
        return <RecommendedRouteDto>{
            start: route.start,
            destination: route.destination,
            via: route.intermediateMetros(),
            travelTime: route.travelTime
        };
    }
}
