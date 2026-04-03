import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { DeliverabilityController } from './deliverability.controller';
import { DeliverabilityService } from './deliverability.service';
import { EmailProviderService } from './email-provider.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [DeliverabilityController],
  providers: [EmailProviderService, DeliverabilityService],
  exports: [EmailProviderService, DeliverabilityService],
})
export class EmailProviderModule {}
