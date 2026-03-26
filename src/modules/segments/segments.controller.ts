import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateSegmentDto } from './dto/create-segment.dto';
import { PreviewSegmentDto } from './dto/preview-segment.dto';
import { QueryMembersDto } from './dto/query-members.dto';
import { SegmentsService } from './segments.service';

@UseGuards(RolesGuard)
@Controller('segments')
export class SegmentsController {
  constructor(private readonly segmentsService: SegmentsService) {}

  @Get()
  findAll(@CurrentTenant() tenantId: string) {
    return this.segmentsService.findAll(tenantId);
  }

  @Get(':id')
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.segmentsService.findOne(tenantId, id);
  }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  previewCount(
    @CurrentTenant() tenantId: string,
    @Body() dto: PreviewSegmentDto,
  ) {
    return this.segmentsService.previewCount(tenantId, dto.conditions);
  }

  @Get(':id/members')
  findMembers(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Query() query: QueryMembersDto,
  ) {
    return this.segmentsService.findMembers(
      tenantId,
      id,
      query.page,
      query.limit,
    );
  }

  @Post()
  @Roles('OWNER', 'ADMIN')
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateSegmentDto) {
    return this.segmentsService.create(tenantId, dto);
  }

  @Post(':id/sync')
  @HttpCode(HttpStatus.OK)
  @Roles('OWNER', 'ADMIN')
  sync(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.segmentsService.syncMembers(tenantId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('OWNER', 'ADMIN')
  async remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    await this.segmentsService.remove(tenantId, id);
  }
}
