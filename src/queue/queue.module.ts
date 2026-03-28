// src/queue/queue.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../database/prisma/prisma.module';
import { EmailProviderModule } from '../modules/email-provider/email-provider.module';
import { CampaignProcessor } from './processors/campaign.processor';
import { EmailProcessor } from './processors/email.processor';
import { SyncProcessor } from './processors/sync.processor';
import { CampaignQueueService } from './services/campaign-queue.service';
import { SyncQueueService } from './services/sync-queue.service';

@Module({
  imports: [
    // Ne pas initialiser BullMQ en environnement test
    ...(process.env.NODE_ENV !== 'test'
      ? [
          BullModule.forRootAsync({
            imports:    [ConfigModule],
            useFactory: (config: ConfigService) => ({
              connection: { url: config.getOrThrow<string>('REDIS_URL') },
            }),
            inject: [ConfigService],
          }),
          BullModule.registerQueue(
            { name: 'campaign' },
            { name: 'email' },
            { name: 'sync' },
          ),
        ]
      : []),
    PrismaModule,
    EmailProviderModule,
  ],
  providers: [
    // Processors seulement hors test
    ...(process.env.NODE_ENV !== 'test'
      ? [CampaignProcessor, EmailProcessor, SyncProcessor]
      : []),
    CampaignQueueService,
    SyncQueueService,
  ],
  exports: [CampaignQueueService, SyncQueueService],
})
export class QueueModule {}