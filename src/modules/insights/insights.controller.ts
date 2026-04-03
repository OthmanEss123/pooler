import {
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
import { QueryInsightsDto } from './dto/query-insights.dto';
import { HealthScoreService } from './health-score.service';
import { InsightsService } from './insights.service';

@UseGuards(RolesGuard)
@Controller('insights')
export class InsightsController {
  constructor(
    private readonly insightsService: InsightsService,
    private readonly healthScoreService: HealthScoreService,
  ) {}

  @Get('health-scores/distribution')
  getDistribution(@CurrentTenant() tenantId: string) {
    return this.healthScoreService.getDistribution(tenantId);
  }

  @Get()
  getAll(@CurrentTenant() tenantId: string, @Query() query: QueryInsightsDto) {
    return this.insightsService.findAll(tenantId, query.unreadOnly);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  markAsRead(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.insightsService.markAsRead(tenantId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('OWNER', 'ADMIN')
  async remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    await this.insightsService.remove(tenantId, id);
  }

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  @Roles('OWNER', 'ADMIN')
  generate(@CurrentTenant() tenantId: string) {
    return this.insightsService.generateInsights(tenantId);
  }
}
