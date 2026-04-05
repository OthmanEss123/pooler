import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { SuppressionReason } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEmail, IsEnum, IsNumber, IsOptional, Min } from 'class-validator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/auth-request';
import { SuppressionListService } from './suppression-list.service';

class AddSuppressionDto {
  @IsEmail()
  email: string;

  @IsEnum(SuppressionReason)
  reason: SuppressionReason;
}

class QuerySuppressionDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  offset?: number = 0;
}

@UseGuards(RolesGuard)
@Roles('OWNER')
@Controller('suppressions')
export class SuppressionListController {
  constructor(
    private readonly suppressionListService: SuppressionListService,
  ) {}

  @Get()
  getList(
    @CurrentTenant() tenantId: string,
    @Query() query: QuerySuppressionDto,
  ) {
    return this.suppressionListService.getList(
      tenantId,
      query.limit,
      query.offset,
    );
  }

  @Post()
  add(@CurrentTenant() tenantId: string, @Body() dto: AddSuppressionDto) {
    return this.suppressionListService.add(tenantId, dto.email, dto.reason);
  }

  @Delete(':email')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentTenant() tenantId: string,
    @Param('email') email: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!user.id) {
      throw new UnauthorizedException('User token required');
    }

    await this.suppressionListService.remove(tenantId, email, {
      userId: user.id,
      role: user.role,
    });
  }
}
