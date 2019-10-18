import { Module } from '@nestjs/common';
import { RouteRepository } from './RouteRepository';
import { DrivineModule } from '@/DrivineModule';

@Module({
    imports: [DrivineModule],
    providers: [RouteRepository],
    controllers: [],
    exports: []
})
export class TrafficModule {}
