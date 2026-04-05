import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { QuotaService } from './quota.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [BillingController],
  providers: [BillingService, QuotaService, RolesGuard],
  exports: [BillingService, QuotaService],
})
export class BillingModule {}
