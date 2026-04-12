import { Controller, ForbiddenException, Get, Headers } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../common/decorators/public.decorator';
import { QueueHealthService } from '../../queue/queue-health.service';
import { MetricsService } from './metrics.service';

@Public()
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
    private readonly queueHealthService: QueueHealthService,
  ) {}

  @Get()
  async getMetrics(@Headers('x-metrics-token') token?: string) {
    const expectedToken =
      this.configService.get<string>('monitoring.metricsToken') ||
      this.configService.get<string>('METRICS_TOKEN');

    if (!expectedToken || token !== expectedToken) {
      throw new ForbiddenException('Invalid metrics token');
    }

    const [metrics, queueStats] = await Promise.all([
      this.metricsService.getMetrics(),
      this.queueHealthService.getStats(),
    ]);

    return {
      timestamp: new Date().toISOString(),
      ...metrics,
      jobsWaiting: queueStats.sync.waiting,
      jobsActive: queueStats.sync.active,
      jobsFailed: queueStats.sync.failed,
    };
  }
}
