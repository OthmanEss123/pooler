import { forwardRef, Module } from '@nestjs/common';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { EncryptionModule } from '../../../common/services/encryption.module';
import { ClickhouseModule } from '../../../database/clickhouse/clickhouse.module';
import { PrismaModule } from '../../../database/prisma/prisma.module';
import { QueueModule } from '../../../queue/queue.module';
import { AdIntelligenceService } from './ad-intelligence.service';
import { GoogleAdsController } from './google-ads.controller';
import { GoogleAdsService } from './google-ads.service';

@Module({
  imports: [
    PrismaModule,
    ClickhouseModule,
    EncryptionModule,
    forwardRef(() => QueueModule),
  ],
  controllers: [GoogleAdsController],
  providers: [GoogleAdsService, AdIntelligenceService, RolesGuard],
  exports: [GoogleAdsService, AdIntelligenceService],
})
export class GoogleAdsModule {}
