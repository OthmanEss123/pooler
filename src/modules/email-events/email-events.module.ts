import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { EmailEventsController } from './email-events.controller';
import { EmailEventsService } from './email-events.service';

@Module({
  imports: [PrismaModule],
  controllers: [EmailEventsController],
  providers: [EmailEventsService],
  exports: [EmailEventsService],
})
export class EmailEventsModule {}
