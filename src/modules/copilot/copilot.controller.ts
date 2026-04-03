import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { AskCopilotDto } from './dto/ask-copilot.dto';
import { CopilotService } from './copilot.service';

@Controller('copilot')
export class CopilotController {
  constructor(private readonly copilotService: CopilotService) {}

  @Get('narrative')
  getNarrative(@CurrentTenant() tenantId: string) {
    return this.copilotService.getNarrative(tenantId);
  }

  @Get('recommendations')
  getRecommendations(@CurrentTenant() tenantId: string) {
    return this.copilotService.getRecommendations(tenantId);
  }

  @Post('ask')
  ask(@CurrentTenant() tenantId: string, @Body() dto: AskCopilotDto) {
    return this.copilotService.ask(tenantId, dto.question, dto.context);
  }
}
