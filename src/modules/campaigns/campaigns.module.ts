import { Module } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { QueueModule } from '../../queue/queue.module';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';

@Module({
  imports: [PrismaModule, QueueModule],
  controllers: [CampaignsController],
  providers: [CampaignsService, RolesGuard],
  exports: [CampaignsService],
})
export class CampaignsModule {}
