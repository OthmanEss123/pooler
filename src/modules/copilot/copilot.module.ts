import { Module, forwardRef } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ClickhouseModule } from '../../database/clickhouse/clickhouse.module';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { RedisModule } from '../../redis/redis.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { GoogleAdsModule } from '../integrations/google-ads/google-ads.module';
import { BriefingController } from './briefing.controller';
import { BriefingService } from './briefing.service';
import { CopilotController } from './copilot.controller';
import { CopilotCronService } from './copilot-cron.service';
import { CopilotService } from './copilot.service';
import { StockAlertService } from './stock-alert.service';

@Module({
  imports: [
    PrismaModule,
    ClickhouseModule,
    RedisModule,
    forwardRef(() => AnalyticsModule),
    forwardRef(() => GoogleAdsModule),
  ],
  controllers: [BriefingController, CopilotController],
  providers: [
    CopilotService,
    BriefingService,
    StockAlertService,
    CopilotCronService,
    RolesGuard,
  ],
  exports: [CopilotService, BriefingService, StockAlertService],
})
export class CopilotModule {}
