import { Module, forwardRef } from '@nestjs/common';
import { ClickhouseModule } from '../../database/clickhouse/clickhouse.module';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { CopilotModule } from '../copilot/copilot.module';
import { ContactsModule } from '../contacts/contacts.module';
import { AnalyticsController } from './analytics.controller';
import { AttributionController } from './attribution.controller';
import { AnalyticsCronService } from './analytics-cron.service';
import { AttributionService } from './attribution.service';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [
    PrismaModule,
    ClickhouseModule,
    forwardRef(() => ContactsModule),
    forwardRef(() => CopilotModule),
  ],
  controllers: [AnalyticsController, AttributionController],
  providers: [AnalyticsService, AttributionService, AnalyticsCronService],
  exports: [AnalyticsService, AttributionService],
})
export class AnalyticsModule {}
