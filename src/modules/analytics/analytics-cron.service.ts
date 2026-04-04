import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma/prisma.service';
import { BriefingService } from '../copilot/briefing.service';
import { EmbeddingsService } from '../contacts/embeddings.service';
import { AnalyticsService } from './analytics.service';

@Injectable()
export class AnalyticsCronService {
  private readonly logger = new Logger(AnalyticsCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsService: AnalyticsService,
    private readonly embeddingsService: EmbeddingsService,
    @Inject(forwardRef(() => BriefingService))
    private readonly briefingService: BriefingService,
  ) {}

  @Cron('0 1 * * *')
  async embedContactsNightly(): Promise<void> {
    if (process.env.NODE_ENV === 'test') {
      this.logger.log('Skipping embeddings cron in test environment.');
      return;
    }

    const tenants = await this.prisma.tenant.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    for (const tenant of tenants) {
      try {
        await this.embeddingsService.embedAllContacts(tenant.id);
      } catch (error) {
        this.logger.error(
          `Failed embedding sync for tenant=${tenant.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

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
        processed += 1;
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

  @Cron('0 7 * * *', {
    name: 'morning-briefing-generation',
  })
  async generateMorningBriefings(): Promise<void> {
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    const tenants = await this.prisma.tenant.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    for (const tenant of tenants) {
      try {
        await this.briefingService.generateBriefing(tenant.id);
      } catch (error) {
        this.logger.error(
          `Briefing cron failed for tenant ${tenant.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
