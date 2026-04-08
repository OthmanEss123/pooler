import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseFilePipeBuilder,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ContactsImportService } from './contacts-import.service';
import { ContactsService } from './contacts.service';
import { EmbeddingsService } from './embeddings.service';
import { SuppressionsService } from './suppressions.service';
import { BulkUpsertContactsDto } from './dto/bulk-upsert-contacts.dto';
import { CreateContactDto } from './dto/create-contact.dto';
import { QueryContactsDto } from './dto/query-contacts.dto';
import { RecentBuyersQueryDto } from './dto/recent-buyers-query.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

@UseGuards(RolesGuard)
@Controller('contacts')
export class ContactsController {
  constructor(
    private readonly contactsService: ContactsService,
    private readonly contactsImportService: ContactsImportService,
    private readonly suppressionsService: SuppressionsService,
    private readonly embeddingsService: EmbeddingsService,
  ) {}

  @Get('import/template')
  @Public()
  getImportTemplate(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=contacts-import-template.csv',
    );
    return this.contactsImportService.getTemplate();
  }

  @Get()
  findAll(@CurrentTenant() tenantId: string, @Query() query: QueryContactsDto) {
    return this.contactsService.findAll(tenantId, query);
  }

  @Post('import')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  importCsv(
    @CurrentTenant() tenantId: string,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: 10 * 1024 * 1024 })
        .build({ errorHttpStatusCode: HttpStatus.PAYLOAD_TOO_LARGE }),
    )
    file: Express.Multer.File,
  ) {
    return this.contactsImportService.importFromCsv(tenantId, file.buffer);
  }

  @Get('export')
  @Roles('OWNER', 'ADMIN')
  @Throttle({ global: { limit: 1, ttl: 60000 } })
  exportCsv(
    @CurrentTenant() tenantId: string,
    @Query() query: QueryContactsDto,
    @Res() res: Response,
  ) {
    return this.contactsService.streamCsv(tenantId, query, res);
  }

  @Get('recent-buyers')
  @Roles('OWNER', 'ADMIN')
  getRecentBuyers(
    @CurrentTenant() tenantId: string,
    @Query() query: RecentBuyersQueryDto,
  ) {
    return this.suppressionsService.getRecentBuyers(tenantId, query.days);
  }

  @Post('embed')
  @Roles('OWNER', 'ADMIN')
  async embedContacts(
    @CurrentTenant() tenantId: string,
    @Body() body: { contactId?: string },
  ) {
    if (body?.contactId) {
      return this.embeddingsService.embedContact(tenantId, body.contactId);
    }

    return this.embeddingsService.embedAllContacts(tenantId);
  }

  @Get(':id/similar')
  @Roles('OWNER', 'ADMIN')
  getSimilarContacts(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = Math.min(Math.max(Number(limit || 10), 1), 50);

    return this.embeddingsService.findSimilarContacts(
      tenantId,
      id,
      parsedLimit,
    );
  }

  @Get(':id')
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.contactsService.findOne(tenantId, id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN')
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateContactDto) {
    return this.contactsService.create(tenantId, dto);
  }

  @Post('bulk')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  bulkUpsert(
    @CurrentTenant() tenantId: string,
    @Body() dto: BulkUpsertContactsDto,
  ) {
    return this.contactsService.bulkUpsert(tenantId, dto);
  }

  @Post('sync-suppression')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  async syncSuppression(@CurrentTenant() tenantId: string) {
    const [segment, audience] = await Promise.all([
      this.suppressionsService.syncRecentBuyersSegment(tenantId, 30),
      this.suppressionsService.syncSuppressionsToAds(tenantId),
    ]);

    return { segment, audience };
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN')
  update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateContactDto,
  ) {
    return this.contactsService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    await this.contactsService.remove(tenantId, id);
  }
}
