import { Module } from '@nestjs/common';
import { QueueModule } from '../../queue/queue.module';
import { MetricsController } from './metrics.controller';

@Module({
  imports: [QueueModule],
  controllers: [MetricsController],
})
export class MetricsModule {}
