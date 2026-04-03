import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthRequest, AuthenticatedUser } from '../types/auth-request';

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

    const request = ctx.switchToHttp().getRequest<AuthRequest>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User context missing');
    }

    if (user.role === 'API_KEY') {
      return this.canActivateForApiKey(user);
    }

    if (!required.includes(user.role)) {
      throw new ForbiddenException(
        `Role insuffisant. Requis: ${required.join(' ou ')}, recu: ${user.role}`,
      );
    }

    return true;
  }

  private canActivateForApiKey(user: AuthenticatedUser): boolean {
    if (user.scope === 'FULL_ACCESS') {
      return true;
    }

    throw new ForbiddenException(
      `Scope insuffisant. Requis: FULL_ACCESS, recu: ${user.scope ?? 'undefined'}`,
    );
  }
}
