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
import { SegmentsService } from './segments.service';
import { CreateSegmentDto } from './dto/create-segment.dto';
import { QuerySegmentsDto } from './dto/query-segments.dto';

@UseGuards(RolesGuard)
@Controller('segments')
export class SegmentsController {
  constructor(private readonly segmentsService: SegmentsService) {}

  @Get()
  findAll(@CurrentTenant() tenantId: string, @Query() query: QuerySegmentsDto) {
    return this.segmentsService.findAll(tenantId, query);
  }

  @Get(':id')
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.segmentsService.findOne(tenantId, id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN')
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateSegmentDto) {
    return this.segmentsService.create(tenantId, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    await this.segmentsService.remove(tenantId, id);
  }
}
