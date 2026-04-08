import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EncryptionModule } from '../../../common/services/encryption.module';
import { PrismaModule } from '../../../database/prisma/prisma.module';
import { QueueModule } from '../../../queue/queue.module';
import { RedisModule } from '../../../redis/redis.module';
import { OrdersModule } from '../../orders/orders.module';
import { ShopifyController } from './shopify.controller';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { ShopifyService } from './shopify.service';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    EncryptionModule,
    RedisModule,
    OrdersModule,
    forwardRef(() => QueueModule),
  ],
  controllers: [ShopifyController],
  providers: [ShopifyService, ShopifyOAuthService],
  exports: [ShopifyService],
})
export class ShopifyModule {}
