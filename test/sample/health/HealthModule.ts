import { Module } from '@nestjs/common';
import { HealthController } from './HealthController';
import { HealthRepository } from './HealthRepository';
import { DrivineModule } from '@/DrivineModule';

@Module({
    imports: [DrivineModule],
    providers: [HealthRepository],
    controllers: [HealthController],
    exports: []
})
export class HealthModule {}
