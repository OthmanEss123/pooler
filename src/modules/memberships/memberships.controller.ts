import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/auth-request';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { MembershipsService } from './memberships.service';

@UseGuards(RolesGuard)
@Controller('tenants/me/members')
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Get()
  findAll(@CurrentTenant() tenantId: string) {
    return this.membershipsService.findAll(tenantId);
  }

  @Post()
  @Roles('OWNER', 'ADMIN')
  invite(@CurrentTenant() tenantId: string, @Body() dto: InviteMemberDto) {
    return this.membershipsService.invite(tenantId, dto);
  }

  @Patch(':userId/role')
  @Roles('OWNER')
  updateRole(
    @CurrentTenant() tenantId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberRoleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!user.id) {
      throw new UnauthorizedException('User token required');
    }

    return this.membershipsService.updateRole(tenantId, userId, dto, user.id);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.OK)
  @Roles('OWNER')
  remove(
    @CurrentTenant() tenantId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!user.id) {
      throw new UnauthorizedException('User token required');
    }

    return this.membershipsService.remove(tenantId, userId, user.id);
  }
}
