import '../config/load-env';
import { BullModule } from '@nestjs/bullmq';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../database/prisma/prisma.module';
import { AnalyticsModule } from '../modules/analytics/analytics.module';
import { EmailEventsModule } from '../modules/email-events/email-events.module';
import { EmailProviderModule } from '../modules/email-provider/email-provider.module';
import { FlowsModule } from '../modules/flows/flows.module';
import { FacebookAdsModule } from '../modules/integrations/facebook-ads/facebook-ads.module';
import { GoogleAdsModule } from '../modules/integrations/google-ads/google-ads.module';
import { ShopifyModule } from '../modules/integrations/shopify/shopify.module';
import { WooCommerceModule } from '../modules/integrations/woocommerce/woocommerce.module';
import { QueueEventsService } from './queue-events.service';
import { QueueHealthService } from './queue-health.service';
import { CampaignProcessor } from './processors/campaign.processor';
import { EmailProcessor } from './processors/email.processor';
import { FlowProcessor } from './processors/flow.processor';
import { SyncProcessor } from './processors/sync.processor';
import { CampaignQueueService } from './services/campaign-queue.service';
import { FlowQueueService } from './services/flow-queue.service';
import { SyncQueueService } from './services/sync-queue.service';

const queueEnabled = process.env.QUEUE_ENABLED !== 'false';

@Module({
  imports: [
    forwardRef(() => AnalyticsModule),
    PrismaModule,
    forwardRef(() => FlowsModule),
    forwardRef(() => GoogleAdsModule),
    forwardRef(() => FacebookAdsModule),
    forwardRef(() => ShopifyModule),
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
          BullModule.registerQueue(
            { name: 'campaign' },
            { name: 'email' },
            { name: 'sync' },
            { name: 'flow' },
          ),
          EmailProviderModule,
          EmailEventsModule,
        ]
      : []),
  ],
  providers: [
    ...(queueEnabled
      ? [CampaignProcessor, EmailProcessor, SyncProcessor, FlowProcessor]
      : []),
    CampaignQueueService,
    SyncQueueService,
    FlowQueueService,
    QueueHealthService,
    QueueEventsService,
  ],
  exports: [
    CampaignQueueService,
    SyncQueueService,
    FlowQueueService,
    QueueHealthService,
  ],
})
export class QueueModule {}
