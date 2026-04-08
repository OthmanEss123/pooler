import { forwardRef, Module } from '@nestjs/common';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { EncryptionModule } from '../../../common/services/encryption.module';
import { PrismaModule } from '../../../database/prisma/prisma.module';
import { QueueModule } from '../../../queue/queue.module';
import { OrdersModule } from '../../orders/orders.module';
import { WooCommerceController } from './woocommerce.controller';
import { WooCommerceService } from './woocommerce.service';

@Module({
  imports: [
    PrismaModule,
    EncryptionModule,
    OrdersModule,
    forwardRef(() => QueueModule),
  ],
  controllers: [WooCommerceController],
  providers: [WooCommerceService, RolesGuard],
  exports: [WooCommerceService],
})
export class WooCommerceModule {}
