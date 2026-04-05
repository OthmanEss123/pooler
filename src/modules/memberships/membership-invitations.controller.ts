import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  UseGuards,
} from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { MembershipsService } from './memberships.service';

@UseGuards(RolesGuard)
@Controller('tenants/me/invitations')
export class MembershipInvitationsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Get()
  @Roles('OWNER', 'ADMIN')
  findAll(@CurrentTenant() tenantId: string) {
    return this.membershipsService.listInvitations(tenantId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles('OWNER')
  revoke(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.membershipsService.revokeInvitation(tenantId, id);
  }
}
