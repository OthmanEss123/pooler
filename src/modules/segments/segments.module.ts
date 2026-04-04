import { Module } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { ContactsModule } from '../contacts/contacts.module';
import { FlowsModule } from '../flows/flows.module';
import { SegmentsController } from './segments.controller';
import { SegmentEvaluator } from './engines/segment-evaluator';
import { SegmentsService } from './segments.service';

@Module({
  imports: [PrismaModule, FlowsModule, ContactsModule],
  controllers: [SegmentsController],
  providers: [SegmentsService, SegmentEvaluator, RolesGuard],
  exports: [SegmentsService],
})
export class SegmentsModule {}
