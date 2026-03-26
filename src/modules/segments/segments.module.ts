import { Module } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { SegmentsController } from './segments.controller';
import { SegmentEvaluator } from './engines/segment-evaluator';
import { SegmentsService } from './segments.service';

@Module({
  imports: [PrismaModule],
  controllers: [SegmentsController],
  providers: [SegmentsService, SegmentEvaluator, RolesGuard],
  exports: [SegmentsService],
})
export class SegmentsModule {}
