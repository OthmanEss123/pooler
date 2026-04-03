import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DeliverabilityQueryDto } from './dto/deliverability-query.dto';
import { DeliverabilityService } from './deliverability.service';

@UseGuards(RolesGuard)
@Controller('deliverability')
export class DeliverabilityController {
  constructor(private readonly deliverabilityService: DeliverabilityService) {}

  @Get('report')
  getReport(
    @CurrentTenant() tenantId: string,
    @Query() query: DeliverabilityQueryDto,
  ) {
    return this.deliverabilityService.getDeliverabilityReport(
      tenantId,
      query.days,
    );
  }

  @Get('bounce-rate')
  getBounceRate(
    @CurrentTenant() tenantId: string,
    @Query() query: DeliverabilityQueryDto,
  ) {
    return this.deliverabilityService.getBounceRate(tenantId, query.days);
  }

  @Get('complaint-rate')
  getComplaintRate(
    @CurrentTenant() tenantId: string,
    @Query() query: DeliverabilityQueryDto,
  ) {
    return this.deliverabilityService.getComplaintRate(tenantId, query.days);
  }

  @Post('suppress')
  @HttpCode(HttpStatus.OK)
  @Roles('OWNER', 'ADMIN')
  async suppress(@CurrentTenant() tenantId: string) {
    const [bounced, complained] = await Promise.all([
      this.deliverabilityService.autoSuppressBounced(tenantId),
      this.deliverabilityService.autoSuppressComplained(tenantId),
    ]);

    return {
      bounced: bounced.suppressed,
      complained: complained.suppressed,
      total: bounced.suppressed + complained.suppressed,
    };
  }
}
