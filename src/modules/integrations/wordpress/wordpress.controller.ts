import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
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
import { ConnectWordPressDto } from './dto/connect-wordpress.dto';
import { WordPressService } from './wordpress.service';

@Controller('integrations/wordpress')
export class WordPressController {
  constructor(private readonly wordPressService: WordPressService) {}

  @Post('connect')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  connect(@CurrentTenant() tenantId: string, @Body() dto: ConnectWordPressDto) {
    return this.wordPressService.connect(tenantId, dto);
  }

  @Post('disconnect')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  disconnect(@CurrentTenant() tenantId: string) {
    return this.wordPressService.disconnect(tenantId);
  }

  @Get('status')
  status(@CurrentTenant() tenantId: string) {
    return this.wordPressService.getStatus(tenantId);
  }

  @Post('sync/users')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  syncUsers(@CurrentTenant() tenantId: string) {
    return this.wordPressService.syncUsers(tenantId);
  }

  @Post('sync/posts')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  syncPosts(@CurrentTenant() tenantId: string) {
    return this.wordPressService.syncPosts(tenantId);
  }

  @Public()
  @Post('webhook/:tenantId')
  @HttpCode(HttpStatus.OK)
  @Throttle({ webhook: { limit: 200, ttl: 60000 } })
  webhook(
    @Param('tenantId') tenantId: string,
    @Headers('x-wp-event') event: string | undefined,
    @Headers('x-wp-secret') secret: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    if (!event) {
      throw new BadRequestException('x-wp-event manquant');
    }

    return this.wordPressService.handleWebhook(tenantId, event, body, secret);
  }
}
