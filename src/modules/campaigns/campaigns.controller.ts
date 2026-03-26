import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CampaignStatus } from '@prisma/client';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateAbTestDto } from './dto/create-ab-test.dto';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { ScheduleCampaignDto } from './dto/schedule-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { CampaignsService } from './campaigns.service';

@UseGuards(RolesGuard)
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Post()
  @Roles('OWNER', 'ADMIN')
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateCampaignDto) {
    return this.campaignsService.create(tenantId, dto);
  }

  @Get()
  findAll(
    @CurrentTenant() tenantId: string,
    @Query('status', new ParseEnumPipe(CampaignStatus, { optional: true }))
    status?: CampaignStatus,
  ) {
    return this.campaignsService.findAll(tenantId, status);
  }

  @Get(':id')
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.campaignsService.findOne(tenantId, id);
  }

  @Get(':id/stats')
  getStats(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.campaignsService.getStats(tenantId, id);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN')
  update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.campaignsService.update(tenantId, id, dto);
  }

  @Post(':id/send')
  @HttpCode(HttpStatus.OK)
  @Roles('OWNER', 'ADMIN')
  send(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.campaignsService.send(tenantId, id);
  }

  @Post(':id/schedule')
  @HttpCode(HttpStatus.OK)
  @Roles('OWNER', 'ADMIN')
  schedule(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: ScheduleCampaignDto,
  ) {
    return this.campaignsService.schedule(tenantId, id, dto.scheduledAt);
  }

  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  @Roles('OWNER', 'ADMIN')
  pause(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.campaignsService.pause(tenantId, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles('OWNER', 'ADMIN')
  cancel(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.campaignsService.cancel(tenantId, id);
  }

  @Post(':id/ab-tests')
  @Roles('OWNER', 'ADMIN')
  addAbTestVariant(
    @CurrentTenant() tenantId: string,
    @Param('id') campaignId: string,
    @Body() dto: CreateAbTestDto,
  ) {
    return this.campaignsService.addAbTestVariant(tenantId, campaignId, dto);
  }

  @Post(':id/ab-tests/:variantId/winner')
  @HttpCode(HttpStatus.OK)
  @Roles('OWNER', 'ADMIN')
  pickWinner(
    @CurrentTenant() tenantId: string,
    @Param('id') campaignId: string,
    @Param('variantId') variantId: string,
  ) {
    return this.campaignsService.pickAbTestWinner(
      tenantId,
      campaignId,
      variantId,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('OWNER', 'ADMIN')
  async remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    await this.campaignsService.remove(tenantId, id);
  }
}
