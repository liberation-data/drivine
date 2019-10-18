import { Controller, Get } from '@nestjs/common';
import { HealthRepository } from './HealthRepository';

interface StatusReport {
    vertices: number;
}

@Controller('health')
export class HealthController {
    public constructor(public readonly healthRepo: HealthRepository) {}

    @Get('check')
    public check(): string {
        return 'OK';
    }

    @Get('status')
    public async status(): Promise<StatusReport> {
        const result = await this.healthRepo.countAllVertices();
        return <StatusReport>{ vertices: result };
    }
}
