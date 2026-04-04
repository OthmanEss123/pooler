import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { BriefingService } from './briefing.service';

@UseGuards(RolesGuard)
@Controller('copilot')
export class BriefingController {
  constructor(private readonly briefingService: BriefingService) {}

  @Get('briefing')
  getBriefing(@CurrentTenant() tenantId: string) {
    return this.briefingService.getBriefing(tenantId);
  }

  @Post('briefing/refresh')
  @HttpCode(HttpStatus.OK)
  @Roles('OWNER', 'ADMIN')
  refreshBriefing(@CurrentTenant() tenantId: string) {
    return this.briefingService.refreshBriefing(tenantId);
  }
}
