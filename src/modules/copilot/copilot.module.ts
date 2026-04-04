import { Module, forwardRef } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ClickhouseModule } from '../../database/clickhouse/clickhouse.module';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { RedisModule } from '../../redis/redis.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { InsightsModule } from '../insights/insights.module';
import { BriefingController } from './briefing.controller';
import { BriefingService } from './briefing.service';
import { CampaignAssistService } from './campaign-assist.service';
import { CopilotController } from './copilot.controller';
import { CopilotService } from './copilot.service';
import { StockAlertService } from './stock-alert.service';

@Module({
  imports: [
    PrismaModule,
    ClickhouseModule,
    RedisModule,
    forwardRef(() => AnalyticsModule),
    forwardRef(() => InsightsModule),
  ],
  controllers: [BriefingController, CopilotController],
  providers: [
    CopilotService,
    BriefingService,
    StockAlertService,
    CampaignAssistService,
    RolesGuard,
  ],
  exports: [
    CopilotService,
    BriefingService,
    StockAlertService,
    CampaignAssistService,
  ],
})
export class CopilotModule {}
