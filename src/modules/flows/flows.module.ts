import { Module, forwardRef } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { QueueModule } from '../../queue/queue.module';
import { EmailProviderModule } from '../email-provider/email-provider.module';
import { FlowExecutor } from './flow-executor';
import { FlowRecoveryService } from './flow-recovery.service';
import { FlowsController } from './flows.controller';
import { FlowsService } from './flows.service';

@Module({
  imports: [PrismaModule, EmailProviderModule, forwardRef(() => QueueModule)],
  controllers: [FlowsController],
  providers: [FlowsService, FlowExecutor, FlowRecoveryService, RolesGuard],
  exports: [FlowsService, FlowExecutor, FlowRecoveryService],
})
export class FlowsModule {}
