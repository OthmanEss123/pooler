import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { BillingModule } from '../billing/billing.module';
import { ContactsController } from './contacts.controller';
import { ContactsImportService } from './contacts-import.service';
import { ContactsService } from './contacts.service';

@Module({
  imports: [PrismaModule, BillingModule],
  controllers: [ContactsController],
  providers: [ContactsService, ContactsImportService],
  exports: [ContactsService, ContactsImportService],
})
export class ContactsModule {}
