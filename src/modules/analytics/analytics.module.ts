import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { ClickhouseModule } from '../../database/clickhouse/clickhouse.module';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsCronService } from './analytics-cron.service';

@Module({
  imports: [PrismaModule, ClickhouseModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsCronService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
