import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ContactsService } from './contacts.service';
import { BulkUpsertContactsDto } from './dto/bulk-upsert-contacts.dto';
import { CreateContactDto } from './dto/create-contact.dto';
import { QueryContactsDto } from './dto/query-contacts.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

@UseGuards(RolesGuard)
@Controller('contacts')
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  findAll(@CurrentTenant() tenantId: string, @Query() query: QueryContactsDto) {
    return this.contactsService.findAll(tenantId, query);
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
