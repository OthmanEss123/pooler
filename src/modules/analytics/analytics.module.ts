import { Module } from '@nestjs/common';
import { ClickhouseModule } from '../../database/clickhouse/clickhouse.module';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsCronService } from './analytics-cron.service';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [PrismaModule, ClickhouseModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsCronService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
