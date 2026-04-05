import { Module } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { QueueModule } from '../../queue/queue.module';
import { BillingModule } from '../billing/billing.module';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';

@Module({
  imports: [PrismaModule, QueueModule, BillingModule],
  controllers: [CampaignsController],
  providers: [CampaignsService, RolesGuard],
  exports: [CampaignsService],
})
export class CampaignsModule {}
