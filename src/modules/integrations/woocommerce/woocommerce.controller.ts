import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { ConnectWooCommerceDto } from './dto/connect-woocommerce.dto';
import { WooCommerceService } from './woocommerce.service';

@Controller('integrations/woocommerce')
export class WooCommerceController {
  constructor(private readonly wooCommerceService: WooCommerceService) {}

  @Get('status')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  status(@CurrentTenant() tenantId: string) {
    return this.wooCommerceService.getStatus(tenantId);
  }

  @Post('connect')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  connect(
    @CurrentTenant() tenantId: string,
    @Body() dto: ConnectWooCommerceDto,
  ) {
    return this.wooCommerceService.connect(tenantId, dto);
  }

  @Post('disconnect')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  disconnect(@CurrentTenant() tenantId: string) {
    return this.wooCommerceService.disconnect(tenantId);
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  async sync(
    @CurrentTenant() tenantId: string,
    @Body() body: { full?: boolean },
  ) {
    const full = Boolean(body?.full);
    const [orders, products] = await Promise.all([
      this.wooCommerceService.syncOrders(tenantId, full),
      this.wooCommerceService.syncProducts(tenantId),
    ]);

    return {
      success: true,
      orders,
      products,
    };
  }

  @Public()
  @Post('webhook/:tenantId')
  @HttpCode(HttpStatus.OK)
  @Throttle({ webhook: { limit: 200, ttl: 60000 } })
  async webhook(
    @Param('tenantId') tenantId: string,
    @Headers('x-wc-webhook-topic') topic: string,
    @Headers('x-wc-webhook-signature') signature: string,
    @Req() req: { rawBody?: Buffer },
    @Res() res: Response,
  ) {
    const rawBody = req.rawBody;

    if (!rawBody) {
      throw new BadRequestException('Raw body manquant');
    }

    const result = await this.wooCommerceService.handleWebhook(
      tenantId,
      topic,
      rawBody,
      signature,
    );

    return res.status(200).json(result);
  }
}
