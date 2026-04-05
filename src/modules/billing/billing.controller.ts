import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { BillingService } from './billing.service';
import { SubscribeDto } from './dto/subscribe.dto';

@UseGuards(RolesGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Public()
  @Get('plans')
  getPlans() {
    return this.billingService.getPlans();
  }

  @Get('usage')
  getUsage(@CurrentTenant() tenantId: string) {
    return this.billingService.getUsage(tenantId);
  }

  @Post('subscribe')
  @HttpCode(HttpStatus.OK)
  @Roles('OWNER')
  subscribe(@CurrentTenant() tenantId: string, @Body() dto: SubscribeDto) {
    return this.billingService.subscribe(tenantId, dto.plan);
  }

  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  @Roles('OWNER')
  cancel(@CurrentTenant() tenantId: string) {
    return this.billingService.cancelSubscription(tenantId);
  }

  @Post('reactivate')
  @HttpCode(HttpStatus.OK)
  @Roles('OWNER')
  reactivate(@CurrentTenant() tenantId: string) {
    return this.billingService.reactivate(tenantId);
  }

  @Get('portal')
  @Roles('OWNER')
  portal(
    @CurrentTenant() tenantId: string,
    @Query('returnUrl') returnUrl?: string,
  ) {
    return this.billingService.getPortalUrl(tenantId, returnUrl);
  }

  @Get('invoices')
  @Roles('OWNER')
  invoices(@CurrentTenant() tenantId: string) {
    return this.billingService.getInvoices(tenantId);
  }

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @Throttle({ webhook: { limit: 200, ttl: 60000 } })
  webhook(
    @Req() req: { rawBody?: Buffer; body?: unknown },
    @Headers('stripe-signature') signature?: string,
  ) {
    const bodyBuffer = req.rawBody
      ? req.rawBody
      : typeof req.body === 'string'
        ? Buffer.from(req.body, 'utf8')
        : req.body
          ? Buffer.from(JSON.stringify(req.body), 'utf8')
          : null;
    if (!bodyBuffer) {
      throw new BadRequestException('Raw body manquant');
    }
    return this.billingService.handleWebhook(bodyBuffer, signature);
  }
}
