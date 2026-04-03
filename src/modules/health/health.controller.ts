import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  async check() {
    const result = await this.healthService.check();

    if (process.env.NODE_ENV === 'production') {
      return {
        status: result.status,
        timestamp: result.timestamp,
      };
    }

    return result;
  }
}
