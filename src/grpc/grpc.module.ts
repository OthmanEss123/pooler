import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from '../database/prisma/prisma.module';
import { AnalyticsModule } from '../modules/analytics/analytics.module';
import { InsightsModule } from '../modules/insights/insights.module';
import { GrpcAuthInterceptor } from './interceptors/grpc-tenant.interceptor';
import { CampaignsGrpcService } from './services/campaigns.grpc.service';
import { ContactsGrpcService } from './services/contacts.grpc.service';
import { IntelligenceGrpcService } from './services/intelligence.grpc.service';

@Module({
  imports: [PrismaModule, AnalyticsModule, InsightsModule],
  providers: [
    ContactsGrpcService,
    IntelligenceGrpcService,
    CampaignsGrpcService,
    {
      provide: APP_INTERCEPTOR,
      useClass: GrpcAuthInterceptor,
    },
  ],
  exports: [ContactsGrpcService, IntelligenceGrpcService, CampaignsGrpcService],
})
export class GrpcModule {}
