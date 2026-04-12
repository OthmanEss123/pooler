import './config/load-env';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AccessGuard } from './common/guards/access.guard';
import { ThrottlerProxyGuard } from './common/guards/throttler-proxy.guard';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { AuditLoggingModule } from './common/services/audit.module';
import appConfig from './config/app.config';
import { envValidation } from './config/env.validation';
import { ClickhouseModule } from './database/clickhouse/clickhouse.module';
import { PrismaModule } from './database/prisma/prisma.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CopilotModule } from './modules/copilot/copilot.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { HealthModule } from './modules/health/health.module';
import { Ga4Module } from './modules/integrations/ga4/ga4.module';
import { GoogleAdsModule } from './modules/integrations/google-ads/google-ads.module';
import { WooCommerceModule } from './modules/integrations/woocommerce/woocommerce.module';
import { MembershipsModule } from './modules/memberships/memberships.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ProductsModule } from './modules/products/products.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { QueueModule } from './queue/queue.module';
import { RedisModule } from './redis/redis.module';

const nodeEnv = process.env.NODE_ENV ?? 'development';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      envFilePath: [`.env.${nodeEnv}`, '.env'],
      validationSchema: envValidation,
    }),
    ThrottlerModule.forRoot([
      {
        name: 'global',
        ttl: 60000,
        limit: 100,
      },
      {
        name: 'auth',
        ttl: 60000,
        limit: 5,
      },
      {
        name: 'authRefresh',
        ttl: 60000,
        limit: 10,
      },
      {
        name: 'webhook',
        ttl: 60000,
        limit: 200,
      },
    ]),
    PrismaModule,
    ClickhouseModule,
    RedisModule,
    AuditLoggingModule,
    HealthModule,
    AuthModule,
    AuditModule,
    TenantsModule,
    MembershipsModule,
    ContactsModule,
    CopilotModule,
    OrdersModule,
    ProductsModule,
    QueueModule,
    AnalyticsModule,
    MetricsModule,
    Ga4Module,
    GoogleAdsModule,
    WooCommerceModule,
    ScheduleModule.forRoot(),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerProxyGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AccessGuard,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
