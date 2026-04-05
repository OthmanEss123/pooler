import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../../common/types/auth-request';
import { PrismaService } from '../../../database/prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  tenantId: string;
  email: string;
  role: string;
  emailVerified?: boolean;
}

type CookieRequest = Request & {
  cookies?: {
    access_token?: string;
  };
};

const extractAccessToken = (req: Request): string | null => {
  const token = (req as CookieRequest).cookies?.access_token;
  return typeof token === 'string' ? token : null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        extractAccessToken,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
      ignoreExpiration: false,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const [user, membership] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          isActive: true,
          emailVerified: true,
        },
      }),
      this.prisma.membership.findUnique({
        where: {
          tenantId_userId: {
            tenantId: payload.tenantId,
            userId: payload.sub,
          },
        },
        include: {
          tenant: {
            select: {
              isActive: true,
            },
          },
        },
      }),
    ]);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Utilisateur inactif ou introuvable');
    }

    if (!membership || !membership.tenant || !membership.tenant.isActive) {
      throw new UnauthorizedException('Tenant inactif ou introuvable');
    }

    return {
      id: user.id,
      tenantId: payload.tenantId,
      email: user.email,
      role: membership.role,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
    };
  }
}
