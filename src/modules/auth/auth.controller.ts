import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
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
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto);
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
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
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
  @Post('refresh')
  async refresh(
    @Req() req: AuthRequest,
    @Ip() ip: string,
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
      ipAddress: ip,
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
      await this.authService.logout(tokenFamily);
    }

    this.clearAuthCookies(res);

    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @UseGuards(RolesGuard)
  @Roles('OWNER', 'ADMIN')
  @Post('api-keys')
  async createApiKey(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateApiKeyDto,
  ) {
    if (!user.id) {
      throw new UnauthorizedException('User token required');
    }

    return this.authService.createApiKey({
      tenantId: user.tenantId,
      name: dto.name,
      scope: dto.scope,
    });
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
