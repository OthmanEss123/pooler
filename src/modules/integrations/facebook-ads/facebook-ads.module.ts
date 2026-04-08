import { Module } from '@nestjs/common';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { EncryptionModule } from '../../../common/services/encryption.module';
import { ClickhouseModule } from '../../../database/clickhouse/clickhouse.module';
import { PrismaModule } from '../../../database/prisma/prisma.module';
import { FacebookAdsApiClient } from './facebook-ads-api.client';
import { FacebookAdsController } from './facebook-ads.controller';
import { FacebookAdsService } from './facebook-ads.service';

@Module({
  imports: [PrismaModule, EncryptionModule, ClickhouseModule],
  controllers: [FacebookAdsController],
  providers: [FacebookAdsService, FacebookAdsApiClient, RolesGuard],
  exports: [FacebookAdsService],
})
export class FacebookAdsModule {}
