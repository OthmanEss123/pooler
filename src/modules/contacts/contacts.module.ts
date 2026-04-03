import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { FlowsModule } from '../flows/flows.module';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { SuppressionsService } from './suppressions.service';

@Module({
  imports: [PrismaModule, FlowsModule],
  controllers: [ContactsController],
  providers: [ContactsService, SuppressionsService],
  exports: [ContactsService, SuppressionsService],
})
export class ContactsModule {}
