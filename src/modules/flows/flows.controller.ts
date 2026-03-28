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
  UseGuards,
} from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateFlowDto } from './dto/create-flow.dto';
import { UpdateFlowDto } from './dto/update-flow.dto';
import { FlowsService } from './flows.service';
import { IsNotEmpty, IsString } from 'class-validator';

class TriggerFlowDto {
  @IsString()
  @IsNotEmpty()
  contactId!: string;
}

@UseGuards(RolesGuard)
@Controller('flows')
export class FlowsController {
  constructor(private readonly flowsService: FlowsService) {}

  @Post()
  @Roles('OWNER', 'ADMIN')
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateFlowDto) {
    return this.flowsService.create(tenantId, dto);
  }

  @Get()
  findAll(@CurrentTenant() tenantId: string) {
    return this.flowsService.findAll(tenantId);
  }

  @Get(':id')
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.flowsService.findOne(tenantId, id);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN')
  update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateFlowDto,
  ) {
    return this.flowsService.update(tenantId, id, dto);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @Roles('OWNER', 'ADMIN')
  activate(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.flowsService.activate(tenantId, id);
  }

  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  @Roles('OWNER', 'ADMIN')
  pause(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.flowsService.pause(tenantId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('OWNER', 'ADMIN')
  async remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    await this.flowsService.remove(tenantId, id);
  }

  @Post(':id/trigger')
  @HttpCode(HttpStatus.OK)
  @Roles('OWNER', 'ADMIN')
  trigger(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() body: TriggerFlowDto,
  ) {
    return this.flowsService.triggerFlow(tenantId, id, body.contactId);
  }

  @Get(':id/executions')
  findExecutions(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.flowsService.findExecutions(tenantId, id);
  }
}
