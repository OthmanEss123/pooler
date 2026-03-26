import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AccessGuard } from './common/guards/access.guard';
import appConfig from './config/app.config';
import { envValidation } from './config/env.validation';
import { ClickhouseModule } from './database/clickhouse/clickhouse.module';
import { PrismaModule } from './database/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { EmailEventsModule } from './modules/email-events/email-events.module';
import { HealthModule } from './modules/health/health.module';
import { MembershipsModule } from './modules/memberships/memberships.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ProductsModule } from './modules/products/products.module';
import { SegmentsModule } from './modules/segments/segments.module';
import { EmailProviderModule } from './modules/email-provider/email-provider.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { QueueModule } from './queue/queue.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      validationSchema: envValidation,
    }),
    PrismaModule,
    ClickhouseModule,
    SegmentsModule,
    CampaignsModule,
    EmailEventsModule,
    HealthModule,
    AuthModule,
    TenantsModule,
    MembershipsModule,
    ContactsModule,
    OrdersModule,
    ProductsModule,
    EmailProviderModule,
    QueueModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AccessGuard }],
})
export class AppModule {}
