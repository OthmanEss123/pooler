import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AnalyticsService } from './analytics.service';
import { IngestDailyMetricsDto } from './dto/ingest-daily-metrics.dto';
import { QueryAnalyticsDto } from './dto/query-analytics.dto';

@UseGuards(RolesGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('summary')
  getSummary(
    @CurrentTenant() tenantId: string,
    @Query() query: QueryAnalyticsDto,
  ) {
    return this.analyticsService.getSummary(tenantId, query.from, query.to);
  }

  @Get('revenue')
  getRevenue(
    @CurrentTenant() tenantId: string,
    @Query() query: QueryAnalyticsDto,
  ) {
    return this.analyticsService.getRevenueTimeSeries(
      tenantId,
      query.from,
      query.to,
      query.granularity ?? 'day',
    );
  }

  @Get('roas')
  getRoas(
    @CurrentTenant() tenantId: string,
    @Query() query: QueryAnalyticsDto,
  ) {
    return this.analyticsService.getBlendedRoasTimeSeries(
      tenantId,
      query.from,
      query.to,
    );
  }

  @Post('ingest/daily')
  @Roles('OWNER', 'ADMIN')
  async ingestDaily(
    @CurrentTenant() tenantId: string,
    @Body() body: IngestDailyMetricsDto,
  ) {
    await this.analyticsService.ingestDailyMetrics(tenantId, body.date);

    return {
      success: true,
      message: 'Daily metrics ingested successfully.',
    };
  }
}
