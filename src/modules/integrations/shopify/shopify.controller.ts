import {
  BadRequestException,
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
import { ShopifyOAuthService } from './shopify-oauth.service';
import { ShopifyService } from './shopify.service';

@Controller('integrations/shopify')
export class ShopifyController {
  constructor(
    private readonly shopifyOAuth: ShopifyOAuthService,
    private readonly shopifyService: ShopifyService,
  ) {}

  @Get('oauth/url')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  getOAuthUrl(@CurrentTenant() tenantId: string, @Query('shop') shop: string) {
    if (!shop) {
      throw new BadRequestException('shop query parameter required');
    }
    return this.shopifyOAuth.getOAuthUrl(shop, tenantId);
  }

  @Public()
  @Get('oauth/callback')
  async handleOAuthCallback(
    @Query('shop') shop: string,
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    if (!shop || !code || !state) {
      throw new BadRequestException('shop, code, and state are required');
    }
    return this.shopifyOAuth.handleCallback(shop, code, state);
  }

  @Get('status')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  getStatus(@CurrentTenant() tenantId: string) {
    return this.shopifyService.getStatus(tenantId);
  }

  @Post('disconnect')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  disconnect(@CurrentTenant() tenantId: string) {
    return this.shopifyService.disconnect(tenantId);
  }
}
