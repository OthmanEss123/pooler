import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AnalyticsService } from './analytics.service';

@Injectable()
export class AnalyticsCronService {
  private readonly logger = new Logger(AnalyticsCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  @Cron('0 2 * * *')
  async handleDailyIngest(): Promise<void> {
    if (process.env.NODE_ENV === 'test') {
      this.logger.log('Skipping analytics cron in test environment.');
      return;
    }

    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const date = yesterday.toISOString().slice(0, 10);

    const tenants = await this.prisma.tenant.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    let processed = 0;

    for (const tenant of tenants) {
      try {
        await this.analyticsService.ingestDailyMetrics(tenant.id, date);
        processed++;
      } catch (error) {
        this.logger.error(
          `Failed ingest for tenant=${tenant.id}, date=${date}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    this.logger.log(
      `Daily analytics ingest completed for ${processed} tenants`,
    );
  }
}
