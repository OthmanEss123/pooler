import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { ConnectFacebookDto } from './dto/connect-facebook.dto';
import { SyncFacebookAdsMetricsDto } from './dto/sync-facebook-ads-metrics.dto';
import { SyncFacebookAudienceDto } from './dto/sync-facebook-audience.dto';
import { FacebookAdsService } from './facebook-ads.service';

@Controller('integrations/facebook-ads')
export class FacebookAdsController {
  constructor(private readonly facebookAdsService: FacebookAdsService) {}

  @Public()
  @Get('oauth/url')
  getOAuthUrl(@Query('tenantId') tenantId?: string) {
    if (!tenantId?.trim()) {
      throw new BadRequestException('tenantId query requis');
    }
    return this.facebookAdsService.getOAuthUrl(tenantId.trim());
  }

  @Public()
  @Get('oauth/callback')
  handleOAuthCallback(
    @Query('code') code?: string,
    @Query('state') state?: string,
  ) {
    return this.facebookAdsService.handleOAuthCallback(code, state);
  }

  @Post('connect')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('OWNER')
  connect(@CurrentTenant() tenantId: string, @Body() body: ConnectFacebookDto) {
    return this.facebookAdsService.connect(tenantId, body);
  }

  @Post('disconnect')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('OWNER')
  disconnect(@CurrentTenant() tenantId: string) {
    return this.facebookAdsService.disconnect(tenantId);
  }

  @Post('sync/campaigns')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  syncCampaigns(@CurrentTenant() tenantId: string) {
    return this.facebookAdsService.syncCampaigns(tenantId);
  }

  @Post('sync/metrics')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  syncMetrics(
    @CurrentTenant() tenantId: string,
    @Body() body: SyncFacebookAdsMetricsDto,
  ) {
    return this.facebookAdsService.syncMetrics(
      tenantId,
      body.dateFrom,
      body.dateTo,
    );
  }

  @Get('campaigns')
  @UseGuards(RolesGuard)
  listCampaigns(@CurrentTenant() tenantId: string) {
    return this.facebookAdsService.listCampaigns(tenantId);
  }

  @Post('audiences/sync')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  syncAudience(
    @CurrentTenant() tenantId: string,
    @Body() body: SyncFacebookAudienceDto,
  ) {
    return this.facebookAdsService.syncAudienceFromSegment(
      tenantId,
      body.segmentId,
    );
  }
}
