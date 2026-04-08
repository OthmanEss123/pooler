import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { BillingModule } from '../billing/billing.module';
import { FlowsModule } from '../flows/flows.module';
import { ContactsController } from './contacts.controller';
import { ContactsImportService } from './contacts-import.service';
import { ContactsService } from './contacts.service';
import { EmbeddingsService } from './embeddings.service';
import { SuppressionListController } from './suppression-list.controller';
import { SuppressionListService } from './suppression-list.service';
import { SuppressionsService } from './suppressions.service';

@Module({
  imports: [PrismaModule, FlowsModule, BillingModule],
  controllers: [ContactsController, SuppressionListController],
  providers: [
    ContactsService,
    ContactsImportService,
    SuppressionsService,
    EmbeddingsService,
    SuppressionListService,
  ],
  exports: [
    ContactsService,
    ContactsImportService,
    SuppressionsService,
    EmbeddingsService,
    SuppressionListService,
  ],
})
export class ContactsModule {}
