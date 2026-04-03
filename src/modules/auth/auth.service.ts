import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiKeyScope, UserRole } from '@prisma/client';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import * as bcrypt from 'bcrypt';
import { AuditService } from '../../common/services/audit.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

interface AuthAuditContext {
  requestId?: string;
  tenantId?: string | null;
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
  ) {}

  async register(dto: RegisterDto, auditContext?: AuthAuditContext) {
    const normalizedEmail = dto.email.toLowerCase();

    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new ConflictException('Email already in use');
    }

    const existingTenant = await this.prisma.tenant.findUnique({
      where: { slug: dto.tenantSlug },
    });

    if (existingTenant) {
      throw new ConflictException('Tenant slug already in use');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const { tenant, user } = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.tenantName,
          slug: dto.tenantSlug,
        },
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: normalizedEmail,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: UserRole.OWNER,
        },
      });

      await tx.membership.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          role: UserRole.OWNER,
        },
      });

      return { tenant, user };
    });

    const tokens = await this.generateTokens(
      user.id,
      tenant.id,
      user.email,
      user.role,
    );

    this.recordSuccessfulRegister(user, auditContext);

    return {
      user: this.sanitizeUser(user),
      tenant,
      ...tokens,
    };
  }

  async login(dto: LoginDto, auditContext?: AuthAuditContext) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { tenant: true },
    });

    if (!user || !user.isActive || !user.tenant.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.generateTokens(
      user.id,
      user.tenantId,
      user.email,
      user.role,
    );

    this.recordSuccessfulLogin(user, auditContext);

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  async refresh(params: {
    refreshToken: string;
    tokenFamily: string;
    userAgent?: string;
    ipAddress?: string;
    requestId?: string;
  }) {
    const incomingHash = this.sha256(params.refreshToken);

    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: incomingHash },
      include: { user: true },
    });

    if (
      !existing ||
      !this.safeCompare(existing.tokenFamily, params.tokenFamily)
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (existing.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { tokenFamily: existing.tokenFamily },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    if (existing.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const newRawRefreshToken = randomBytes(64).toString('hex');
    const newRefreshHash = this.sha256(newRawRefreshToken);

    const accessToken = await this.jwtService.signAsync({
      sub: existing.user.id,
      tenantId: existing.user.tenantId,
      email: existing.user.email,
      role: existing.user.role,
    });

    const newToken = await this.prisma.$transaction(async (tx) => {
      const created = await tx.refreshToken.create({
        data: {
          tenantId: existing.tenantId,
          userId: existing.userId,
          tokenHash: newRefreshHash,
          tokenFamily: existing.tokenFamily,
          expiresAt: this.daysFromNow(7),
          userAgent: params.userAgent,
          ipAddress: params.ipAddress,
        },
      });

      await tx.refreshToken.update({
        where: { id: existing.id },
        data: {
          revokedAt: new Date(),
          replacedByTokenId: created.id,
        },
      });

      return created;
    });

    this.recordSuccessfulRefresh(
      {
        id: existing.user.id,
        tenantId: existing.user.tenantId,
        email: existing.user.email,
      },
      {
        requestId: params.requestId,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    );

    return {
      accessToken,
      refreshToken: newRawRefreshToken,
      tokenFamily: newToken.tokenFamily,
    };
  }

  async logout(tokenFamily: string, auditContext?: AuthAuditContext) {
    const tokenContext =
      auditContext?.tenantId && auditContext.userId
        ? {
            tenantId: auditContext.tenantId,
            userId: auditContext.userId,
          }
        : await this.prisma.refreshToken.findFirst({
            where: { tokenFamily },
            orderBy: { createdAt: 'desc' },
            select: {
              tenantId: true,
              userId: true,
            },
          });

    await this.prisma.refreshToken.updateMany({
      where: { tokenFamily },
      data: { revokedAt: new Date() },
    });

    if (tokenContext?.tenantId && tokenContext.userId) {
      this.auditService.log({
        tenantId: tokenContext.tenantId,
        userId: tokenContext.userId,
        action: 'AUTH_LOGOUT',
        entity: 'AUTH',
        entityId: tokenContext.userId,
        metadata: {
          tokenFamily,
          requestId: auditContext?.requestId ?? null,
        },
        ipAddress: auditContext?.ipAddress ?? null,
        userAgent: auditContext?.userAgent ?? null,
      });
    }

    return { ok: true };
  }

  async createApiKey(params: {
    tenantId: string;
    userId?: string | null;
    name: string;
    scope?: ApiKeyScope;
    requestId?: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }) {
    const rawSecret = randomBytes(32).toString('hex');
    const rawKey = `pk_${rawSecret}`;
    const keyHash = this.sha256(rawKey);
    const prefix = rawKey.slice(0, 10);

    const apiKey = await this.prisma.apiKey.create({
      data: {
        tenantId: params.tenantId,
        name: params.name,
        prefix,
        keyHash,
        scope: params.scope ?? ApiKeyScope.FULL_ACCESS,
      },
    });

    this.auditService.log({
      tenantId: params.tenantId,
      userId: params.userId ?? null,
      action: 'API_KEY_CREATED',
      entity: 'API_KEY',
      entityId: apiKey.id,
      metadata: {
        name: apiKey.name,
        scope: apiKey.scope,
        prefix: apiKey.prefix,
        requestId: params.requestId ?? null,
      },
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
    });

    return {
      id: apiKey.id,
      name: apiKey.name,
      scope: apiKey.scope,
      key: rawKey,
      prefix: apiKey.prefix,
      createdAt: apiKey.createdAt,
    };
  }

  async validateUserById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { tenant: true },
    });

    if (!user || !user.isActive || !user.tenant.isActive) {
      throw new UnauthorizedException();
    }

    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    };
  }

  async validateApiKey(rawKey: string) {
    const keyHash = this.sha256(rawKey);

    const apiKey = await this.prisma.apiKey.findUnique({
      where: { keyHash },
      include: { tenant: true },
    });

    if (!apiKey || apiKey.revokedAt || !apiKey.tenant.isActive) {
      throw new UnauthorizedException('Invalid API key');
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      throw new UnauthorizedException('API key expired');
    }

    await this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      id: null,
      tenantId: apiKey.tenantId,
      email: null,
      role: 'API_KEY' as const,
      scope: apiKey.scope,
      isActive: true,
    };
  }

  async switchTenant(userId: string, targetTenantId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: {
        tenantId_userId: { tenantId: targetTenantId, userId },
      },
      include: { tenant: true },
    });

    if (!membership || !membership.tenant.isActive) {
      throw new ForbiddenException(
        "Vous n'etes pas membre de cette organisation",
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }

    const tokens = await this.generateTokens(
      userId,
      targetTenantId,
      user.email,
      membership.role,
    );

    return { tokens, tenant: membership.tenant };
  }

  async getMyTenants(userId: string) {
    return this.prisma.membership.findMany({
      where: { userId },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async generateTokens(
    userId: string,
    tenantId: string,
    email: string,
    role: UserRole,
  ) {
    const tokenFamily = randomUUID();
    const accessToken = await this.jwtService.signAsync({
      sub: userId,
      tenantId,
      email,
      role,
    });

    const rawRefreshToken = randomBytes(64).toString('hex');
    const tokenHash = this.sha256(rawRefreshToken);

    await this.prisma.refreshToken.create({
      data: {
        tenantId,
        userId,
        tokenHash,
        tokenFamily,
        expiresAt: this.daysFromNow(7),
      },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      tokenFamily,
    };
  }

  private recordSuccessfulRegister(
    user: {
      id: string;
      tenantId: string;
      email: string;
    },
    auditContext?: AuthAuditContext,
  ) {
    this.auditService.log({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'AUTH_REGISTER',
      entity: 'USER',
      entityId: user.id,
      metadata: {
        email: user.email,
        requestId: auditContext?.requestId ?? null,
      },
      ipAddress: auditContext?.ipAddress ?? null,
      userAgent: auditContext?.userAgent ?? null,
    });
  }

  private recordSuccessfulLogin(
    user: {
      id: string;
      tenantId: string;
      email: string;
    },
    auditContext?: AuthAuditContext,
  ) {
    this.auditService.log({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'AUTH_LOGIN',
      entity: 'AUTH',
      entityId: user.id,
      metadata: {
        email: user.email,
        requestId: auditContext?.requestId ?? null,
      },
      ipAddress: auditContext?.ipAddress ?? null,
      userAgent: auditContext?.userAgent ?? null,
    });
  }

  private recordSuccessfulRefresh(
    user: {
      id: string;
      tenantId: string;
      email: string;
    },
    auditContext: {
      requestId?: string;
      ipAddress?: string;
      userAgent?: string;
    },
  ) {
    this.auditService.log({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'AUTH_REFRESH',
      entity: 'AUTH',
      entityId: user.id,
      metadata: {
        email: user.email,
        requestId: auditContext.requestId ?? null,
      },
      ipAddress: auditContext.ipAddress ?? null,
      userAgent: auditContext.userAgent ?? null,
    });
  }

  private sanitizeUser(user: {
    id: string;
    email: string;
    tenantId: string;
    role: UserRole;
    firstName?: string | null;
    lastName?: string | null;
    createdAt: Date;
    lastLoginAt?: Date | null;
  }) {
    return {
      id: user.id,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt ?? null,
    };
  }

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }

  private daysFromNow(days: number): Date {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }
}
