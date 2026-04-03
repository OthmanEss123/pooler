import { Module } from '@nestjs/common';
import { ClickhouseModule } from '../../database/clickhouse/clickhouse.module';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { EmailEventsController } from './email-events.controller';
import { EmailEventsService } from './email-events.service';

@Module({
  imports: [PrismaModule, ClickhouseModule],
  controllers: [EmailEventsController],
  providers: [EmailEventsService],
  exports: [EmailEventsService],
})
export class EmailEventsModule {}
