import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { ConnectGoogleAdsDto } from './dto/connect-google-ads.dto';
import { SyncGoogleAdsAudienceDto } from './dto/sync-google-ads-audience.dto';
import { SyncGoogleAdsMetricsDto } from './dto/sync-google-ads-metrics.dto';
import { UpdateGoogleAdsBudgetDto } from './dto/update-google-ads-budget.dto';
import { GoogleAdsService } from './google-ads.service';

@Controller('integrations/google-ads')
export class GoogleAdsController {
  constructor(private readonly googleAdsService: GoogleAdsService) {}

  @Get('oauth/url')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  getOAuthUrl(@CurrentTenant() tenantId: string) {
    return this.googleAdsService.getOAuthUrl(tenantId);
  }

  @Public()
  @Get('oauth/callback')
  async handleOAuthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    if (!state) {
      throw new BadRequestException('state manquant');
    }

    return this.googleAdsService.handleOAuthCallback(state, code);
  }

  @Post('connect')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  connect(
    @CurrentTenant() tenantId: string,
    @Body() body: ConnectGoogleAdsDto,
  ) {
    return this.googleAdsService.connect(
      tenantId,
      body.refreshToken,
      body.customerId,
    );
  }

  @Post('disconnect')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  disconnect(@CurrentTenant() tenantId: string) {
    return this.googleAdsService.disconnect(tenantId);
  }

  @Post('sync/campaigns')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  syncCampaigns(@CurrentTenant() tenantId: string) {
    return this.googleAdsService.syncCampaigns(tenantId);
  }

  @Post('sync/metrics')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  syncMetrics(
    @CurrentTenant() tenantId: string,
    @Body() body: SyncGoogleAdsMetricsDto,
  ) {
    return this.googleAdsService.syncMetrics(
      tenantId,
      body.dateFrom,
      body.dateTo,
    );
  }

  @Get('campaigns')
  listCampaigns(@CurrentTenant() tenantId: string) {
    return this.googleAdsService.listCampaigns(tenantId);
  }

  @Get('campaigns/:id')
  getCampaign(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.googleAdsService.getCampaignById(tenantId, id);
  }

  @Post('campaigns/:id/pause')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  pauseCampaign(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.googleAdsService.pauseCampaign(tenantId, id);
  }

  @Post('campaigns/:id/enable')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  enableCampaign(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.googleAdsService.enableCampaign(tenantId, id);
  }

  @Patch('campaigns/:id/budget')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  updateBudget(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() body: UpdateGoogleAdsBudgetDto,
  ) {
    return this.googleAdsService.updateBudget(tenantId, id, body.budgetMicros);
  }

  @Post('audiences/sync')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  syncAudience(
    @CurrentTenant() tenantId: string,
    @Body() body: SyncGoogleAdsAudienceDto,
  ) {
    return this.googleAdsService.syncAudienceFromSegment(
      tenantId,
      body.segmentId,
      body.audienceName,
    );
  }
}
