import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyScope } from '@prisma/client';
import type { AuthRequest } from '../types/auth-request';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true;
    }

    const { user } = ctx.switchToHttp().getRequest<AuthRequest>();

    if (!user) {
      throw new ForbiddenException('Utilisateur non authentifie');
    }

    if (user.role === 'API_KEY') {
      if (user.scope !== ApiKeyScope.FULL_ACCESS) {
        throw new ForbiddenException(
          `Scope API key insuffisant. Requis: FULL_ACCESS, recu: ${user.scope ?? 'unknown'}`,
        );
      }
    }

    if (!required.includes(user.role)) {
      throw new ForbiddenException(
        `Role insuffisant. Requis: ${required.join(' ou ')}, recu: ${user.role}`,
      );
    }

    return true;
  }
}
