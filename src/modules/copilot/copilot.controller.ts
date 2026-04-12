import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Get } from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AskCopilotDto } from './dto/ask-copilot.dto';
import { CopilotService } from './copilot.service';

@UseGuards(RolesGuard)
@Controller('copilot')
export class CopilotController {
  constructor(private readonly copilotService: CopilotService) {}

  @Get('recommendations')
  getRecommendations(@CurrentTenant() tenantId: string) {
    return this.copilotService.getRecommendations(tenantId);
  }

  @Post('ask')
  @HttpCode(HttpStatus.OK)
  ask(@CurrentTenant() tenantId: string, @Body() dto: AskCopilotDto) {
    return this.copilotService.ask(tenantId, dto.question, dto.context);
  }
}
