import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AdIntelligenceService } from '../integrations/google-ads/ad-intelligence.service';
import { StockAlertService } from './stock-alert.service';

@Injectable()
export class CopilotCronService {
  private readonly logger = new Logger(CopilotCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adIntelligenceService: AdIntelligenceService,
    private readonly stockAlertService: StockAlertService,
  ) {}

  @Cron('0 3 * * *', {
    name: 'google-ads-intelligence-and-stock-alerts',
  })
  async handleNightlySignals(): Promise<void> {
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
        await this.adIntelligenceService.runFullAnalysis(tenant.id);
        await this.stockAlertService.detectLowStock(tenant.id);
      } catch (error) {
        this.logger.error(
          `Nightly signal generation failed for tenant ${tenant.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
