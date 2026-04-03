import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { ConnectGa4Dto } from './dto/connect-ga4.dto';
import { IngestEventDto } from './dto/ingest-event.dto';
import { SyncSessionsDto } from './dto/sync-sessions.dto';
import { Ga4Service } from './ga4.service';

@Controller('integrations/ga4')
export class Ga4Controller {
  constructor(private readonly ga4Service: Ga4Service) {}

  @Get('status')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  getStatus(@CurrentTenant() tenantId: string) {
    return this.ga4Service.getStatus(tenantId);
  }

  @Post('connect')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  connect(@CurrentTenant() tenantId: string, @Body() body: ConnectGa4Dto) {
    return this.ga4Service.connect(tenantId, body);
  }

  @Post('disconnect')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  disconnect(@CurrentTenant() tenantId: string) {
    return this.ga4Service.disconnect(tenantId);
  }

  @Post('sync/sessions')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  syncSessions(
    @CurrentTenant() tenantId: string,
    @Body() body: SyncSessionsDto,
  ) {
    return this.ga4Service.syncSessions(tenantId, body);
  }

  @Public()
  @Post('events/:tenantId')
  @HttpCode(HttpStatus.OK)
  @Throttle({ webhook: { limit: 200, ttl: 60000 } })
  receiveEvent(
    @Param('tenantId') tenantId: string,
    @Body() body: IngestEventDto,
  ) {
    return this.ga4Service.ingestEvent(tenantId, body);
  }
}
