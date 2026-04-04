import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AttributionService } from './attribution.service';
import { QueryAttributionDto } from './dto/query-attribution.dto';

@UseGuards(RolesGuard)
@Controller('analytics')
export class AttributionController {
  constructor(private readonly attributionService: AttributionService) {}

  @Get('attribution')
  getAttribution(
    @CurrentTenant() tenantId: string,
    @Query() query: QueryAttributionDto,
  ) {
    return this.attributionService.getAttributionSummary(tenantId, query);
  }
}
