import { BullModule } from '@nestjs/bullmq';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../database/prisma/prisma.module';
import { AnalyticsModule } from '../modules/analytics/analytics.module';
import { EmailProviderModule } from '../modules/email-provider/email-provider.module';
import { FlowsModule } from '../modules/flows/flows.module';
import { CampaignProcessor } from './processors/campaign.processor';
import { EmailProcessor } from './processors/email.processor';
import { FlowProcessor } from './processors/flow.processor';
import { SyncProcessor } from './processors/sync.processor';
import { CampaignQueueService } from './services/campaign-queue.service';
import { FlowQueueService } from './services/flow-queue.service';
import { SyncQueueService } from './services/sync-queue.service';

const isTest = process.env.NODE_ENV === 'test';

@Module({
  imports: [
    AnalyticsModule,
    PrismaModule,
    forwardRef(() => FlowsModule),
    ...(!isTest
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
        ]
      : []),
  ],
  providers: [
    ...(!isTest
      ? [CampaignProcessor, EmailProcessor, SyncProcessor, FlowProcessor]
      : []),
    CampaignQueueService,
    SyncQueueService,
    FlowQueueService,
  ],
  exports: [CampaignQueueService, SyncQueueService, FlowQueueService],
})
export class QueueModule {}
