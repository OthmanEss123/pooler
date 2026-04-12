import '../config/load-env';
import { BullModule } from '@nestjs/bullmq';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../database/prisma/prisma.module';
import { AnalyticsModule } from '../modules/analytics/analytics.module';
import { GoogleAdsModule } from '../modules/integrations/google-ads/google-ads.module';
import { WooCommerceModule } from '../modules/integrations/woocommerce/woocommerce.module';
import { QueueEventsService } from './queue-events.service';
import { QueueHealthService } from './queue-health.service';
import { SyncProcessor } from './processors/sync.processor';
import { SyncQueueService } from './services/sync-queue.service';

const queueEnabled = process.env.QUEUE_ENABLED !== 'false';

@Module({
  imports: [
    AnalyticsModule,
    PrismaModule,
    forwardRef(() => GoogleAdsModule),
    forwardRef(() => WooCommerceModule),
    ...(queueEnabled
      ? [
          BullModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: (config: ConfigService) => ({
              connection: { url: config.getOrThrow<string>('REDIS_URL') },
            }),
            inject: [ConfigService],
          }),
          BullModule.registerQueue({ name: 'sync' }),
        ]
      : []),
  ],
  providers: [
    ...(queueEnabled ? [SyncProcessor] : []),
    SyncQueueService,
    QueueHealthService,
    QueueEventsService,
  ],
  exports: [SyncQueueService, QueueHealthService],
})
export class QueueModule {}
