import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { CopilotModule } from '../copilot/copilot.module';
import { EmailProviderModule } from '../email-provider/email-provider.module';
import { GoogleAdsModule } from '../integrations/google-ads/google-ads.module';
import { HealthScoreService } from './health-score.service';
import { InsightsController } from './insights.controller';
import { InsightsCronService } from './insights-cron.service';
import { InsightsService } from './insights.service';

@Module({
  imports: [PrismaModule, EmailProviderModule, GoogleAdsModule, CopilotModule],
  controllers: [InsightsController],
  providers: [InsightsService, InsightsCronService, HealthScoreService],
  exports: [InsightsService, HealthScoreService],
})
export class InsightsModule {}
