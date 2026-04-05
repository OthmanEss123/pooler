import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AttributionService } from './attribution.service';
import { QueryAnalyticsDto } from './dto/query-analytics.dto';
import { QueryAttributionDto } from './dto/query-attribution.dto';

@Controller('analytics')
@UseGuards(RolesGuard)
@Roles('OWNER', 'ADMIN')
export class AttributionController {
  constructor(private readonly attributionService: AttributionService) {}

  @Get('attribution')
  getAttribution(
    @CurrentTenant() tenantId: string,
    @Query() query: QueryAttributionDto,
  ) {
    return this.attributionService.getAttributionSummary(tenantId, query);
  }

  @Post('attribution/run')
  runAttribution(
    @CurrentTenant() tenantId: string,
    @Body() body: QueryAttributionDto,
  ) {
    return this.attributionService.getAttributionSummary(tenantId, body);
  }

  @Get('cac')
  getCac(@CurrentTenant() tenantId: string, @Query() query: QueryAnalyticsDto) {
    return this.attributionService.getCacSummary(
      tenantId,
      query.from,
      query.to,
    );
  }

  @Get('ltv')
  getLtv(@CurrentTenant() tenantId: string) {
    return this.attributionService.getLtvBreakdown(tenantId);
  }

  @Get('ltv/:contactId')
  getContactLtv(
    @CurrentTenant() tenantId: string,
    @Param('contactId') contactId: string,
  ) {
    return this.attributionService.getContactLtv(tenantId, contactId);
  }
}
