import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { DeliverabilityController } from './deliverability.controller';
import { DeliverabilityService } from './deliverability.service';
import { EmailProviderService } from './email-provider.service';
import { UnsubscribeController } from './unsubscribe.controller';
import { UnsubscribeService } from './unsubscribe.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [DeliverabilityController, UnsubscribeController],
  providers: [EmailProviderService, DeliverabilityService, UnsubscribeService],
  exports: [EmailProviderService, DeliverabilityService, UnsubscribeService],
})
export class EmailProviderModule {}
