import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import type {
  AuthenticatedUser,
  AuthRequest,
} from '../../common/types/auth-request';
import { AuthService } from './auth.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { DisableMfaDto } from './dto/disable-mfa.dto';
import { EnableMfaDto } from './dto/enable-mfa.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SwitchTenantDto } from './dto/switch-tenant.dto';
import { VerifyMfaDto } from './dto/verify-mfa.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({
    auth: { limit: 5, ttl: 60000 },
  })
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto, {
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? null,
    });

    this.setAuthCookies(
      res,
      result.accessToken,
      result.refreshToken,
      result.tokenFamily,
    );

    return {
      user: result.user,
      tenant: result.tenant,
    };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({
    auth: { limit: 5, ttl: 60000 },
  })
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto, {
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? null,
    });

    if ('requiresMfa' in result && result.requiresMfa) {
      return result;
    }

    this.setAuthCookies(
      res,
      result.accessToken,
      result.refreshToken,
      result.tokenFamily,
    );

    return {
      user: result.user,
    };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('mfa/verify')
  async verifyMfa(
    @Body() dto: VerifyMfaDto,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyMfaLogin(
      dto.mfaTempToken,
      dto.totpCode,
      {
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? null,
      },
    );

    this.setAuthCookies(
      res,
      result.accessToken,
      result.refreshToken,
      result.tokenFamily,
    );

    return { user: result.user };
  }

  @Post('mfa/setup')
  @HttpCode(HttpStatus.OK)
  async setupMfa(@CurrentUser() user: AuthenticatedUser) {
    if (!user.id) {
      throw new UnauthorizedException('User token required');
    }

    const result = await this.authService.setupMfa(user.id);
    return { qrCodeUrl: result.qrCodeUrl };
  }

  @Post('mfa/enable')
  @HttpCode(HttpStatus.OK)
  async enableMfa(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: EnableMfaDto,
  ) {
    if (!user.id) {
      throw new UnauthorizedException('User token required');
    }

    return this.authService.enableMfa(user.id, dto.token);
  }

  @Post('mfa/disable')
  @HttpCode(HttpStatus.OK)
  async disableMfa(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DisableMfaDto,
  ) {
    if (!user.id) {
      throw new UnauthorizedException('User token required');
    }

    return this.authService.disableMfa(user.id, dto.token, dto.password);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({
    authRefresh: { limit: 10, ttl: 60000 },
  })
  @Post('refresh')
  async refresh(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.refresh_token;
    const tokenFamily = req.cookies?.token_family;
    const userAgent = req.get('user-agent') ?? undefined;

    if (!refreshToken || !tokenFamily) {
      return { ok: false };
    }

    const result = await this.authService.refresh({
      refreshToken,
      tokenFamily,
      userAgent,
      ipAddress: req.ip,
      requestId: req.requestId,
    });

    this.setAuthCookies(
      res,
      result.accessToken,
      result.refreshToken,
      result.tokenFamily,
    );

    return { ok: true };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokenFamily = req.cookies?.token_family;

    if (tokenFamily) {
      await this.authService.logout(tokenFamily, {
        requestId: req.requestId,
        tenantId: req.user?.tenantId ?? null,
        userId: req.user?.id ?? null,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? null,
      });
    }

    this.clearAuthCookies(res);

    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Get('my-tenants')
  getMyTenants(@CurrentUser() user: AuthenticatedUser) {
    if (!user.id) {
      throw new UnauthorizedException('User token required');
    }
    return this.authService.getMyTenants(user.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('switch-tenant')
  async switchTenant(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SwitchTenantDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!user.id) {
      throw new UnauthorizedException('User token required');
    }

    const result = await this.authService.switchTenant(user.id, dto.tenantId);

    this.setAuthCookies(
      res,
      result.tokens.accessToken,
      result.tokens.refreshToken,
      result.tokens.tokenFamily,
    );

    return { tenant: result.tenant };
  }

  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  @Post('api-keys')
  async createApiKey(
    @Req() req: AuthRequest,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateApiKeyDto,
  ) {
    if (!user.id) {
      throw new UnauthorizedException('User token required');
    }

    return this.authService.createApiKey({
      tenantId: user.tenantId,
      userId: user.id,
      name: dto.name,
      scope: dto.scope,
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? null,
    });
  }

  @Public()
  @Get('verify-email')
  async verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Throttle({ auth: { limit: 1, ttl: 60000 } })
  @Post('resend-verification')
  async resendVerification(@CurrentUser() user: AuthenticatedUser) {
    if (!user.id) {
      throw new UnauthorizedException('User token required');
    }
    return this.authService.resendVerification(user.id);
  }

  @Public()
  @Get('accept-invite')
  async acceptInvite(@Query('token') token: string, @Req() req: AuthRequest) {
    const authenticatedUser = await this.authService.resolveUserFromAccessToken(
      req.cookies?.access_token ?? null,
    );

    if (authenticatedUser?.id) {
      return this.authService.acceptInvite(token, authenticatedUser.id);
    }

    const invitation = await this.authService.getInvitationInfo(token);
    return { requiresAccount: true, ...invitation };
  }

  private setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
    tokenFamily: string,
  ) {
    const isProd = process.env.NODE_ENV === 'production';

    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
      path: '/',
    });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/v1/auth/refresh',
    });

    res.cookie('token_family', tokenFamily, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/v1/auth/refresh',
    });
  }

  private clearAuthCookies(res: Response) {
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/api/v1/auth/refresh' });
    res.clearCookie('token_family', { path: '/api/v1/auth/refresh' });
  }
}
