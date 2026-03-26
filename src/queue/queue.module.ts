import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CampaignQueueService } from './services/campaign-queue.service';
import { SyncQueueService } from './services/sync-queue.service';
import { CampaignProcessor } from './processors/campaign.processor';
import { EmailProcessor } from './processors/email.processor';
import { SyncProcessor } from './processors/sync.processor';
import { PrismaModule } from '../database/prisma/prisma.module';
import { EmailProviderModule } from '../modules/email-provider/email-provider.module';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>('REDIS_URL', 'redis://localhost:6379'),
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 5000 },
        },
      }),
    }),
    BullModule.registerQueue(
      { name: 'campaign' },
      { name: 'email' },
      { name: 'sync' },
    ),
    PrismaModule,
    EmailProviderModule,
  ],
  providers: [
    CampaignQueueService,
    SyncQueueService,
    CampaignProcessor,
    EmailProcessor,
    SyncProcessor,
  ],
  exports: [CampaignQueueService, SyncQueueService],
})
export class QueueModule {}
