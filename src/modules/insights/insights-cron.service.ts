import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CopilotService } from '../copilot/copilot.service';
import { DeliverabilityService } from '../email-provider/deliverability.service';
import { AdIntelligenceService } from '../integrations/google-ads/ad-intelligence.service';
import { HealthScoreService } from './health-score.service';
import { InsightsService } from './insights.service';

@Injectable()
export class InsightsCronService {
  private readonly logger = new Logger(InsightsCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly insightsService: InsightsService,
    private readonly healthScoreService: HealthScoreService,
    private readonly deliverabilityService: DeliverabilityService,
    private readonly adIntelligenceService: AdIntelligenceService,
    private readonly copilotService: CopilotService,
  ) {}

  async generateInsightsForTenant(tenantId: string): Promise<void> {
    await this.insightsService.generateInsights(tenantId);
    await this.healthScoreService.calculateForTenant(tenantId);
    await this.deliverabilityService.checkAndCreateAlerts(tenantId);
    await this.deliverabilityService.autoSuppressBounced(tenantId);
    await this.deliverabilityService.autoSuppressComplained(tenantId);
    await this.adIntelligenceService.runFullAnalysis(tenantId);
  }

  @Cron('0 3 * * *', {
    name: 'nightly-insights-generation',
  })
  async handleCron(): Promise<void> {
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
        await this.generateInsightsForTenant(tenant.id);
      } catch (error) {
        this.logger.error(
          `Insights cron failed for tenant ${tenant.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  @Cron('0 7 * * *', {
    name: 'daily-narratives-generation',
  })
  async generateDailyNarratives(): Promise<void> {
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    const tenants = await this.prisma.tenant.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    for (const tenant of tenants) {
      try {
        await this.copilotService.generateNarrative(tenant.id);
      } catch (error) {
        this.logger.error(
          `Narrative cron failed for tenant ${tenant.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
