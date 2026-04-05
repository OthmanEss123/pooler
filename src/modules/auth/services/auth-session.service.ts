import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import { AuthTokenService } from './auth-token.service';

@Injectable()
export class AuthSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: AuthTokenService,
  ) {}

  async register(dto: RegisterDto) {
    const normalizedEmail = dto.email.toLowerCase();

    const [emailExists, slugExists] = await Promise.all([
      this.prisma.user.findUnique({ where: { email: normalizedEmail } }),
      this.prisma.tenant.findUnique({ where: { slug: dto.tenantSlug ?? '' } }),
    ]);

    if (emailExists) {
      throw new ConflictException('Email already in use');
    }

    if (slugExists) {
      throw new ConflictException('Tenant slug already in use');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const { tenant, user } = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.tenantName ?? dto.tenantSlug ?? normalizedEmail,
          slug: dto.tenantSlug ?? normalizedEmail.replace(/[^a-z0-9-]/gi, '-'),
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

    const tokens = await this.tokens.generateTokens(
      user.id,
      tenant.id,
      user.email,
      user.role,
    );

    return {
      tenant,
      user: this.sanitize(user),
      ...tokens,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user || !user.isActive) {
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

    const tokens = await this.tokens.generateTokens(
      user.id,
      user.tenantId,
      user.email,
      user.role,
    );

    return {
      user: this.sanitize(user),
      ...tokens,
    };
  }

  async switchTenant(userId: string, targetTenantId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: {
        tenantId_userId: {
          tenantId: targetTenantId,
          userId,
        },
      },
      include: { tenant: true },
    });

    if (!membership) {
      throw new ForbiddenException('You are not a member of this tenant');
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const tokens = await this.tokens.generateTokens(
      user.id,
      targetTenantId,
      user.email,
      membership.role,
    );

    return {
      tenant: membership.tenant,
      tokens,
    };
  }

  private sanitize<T extends { passwordHash: string }>(user: T) {
    return Object.fromEntries(
      Object.entries(user).filter(([key]) => key !== 'passwordHash'),
    ) as Omit<T, 'passwordHash'>;
  }
}
