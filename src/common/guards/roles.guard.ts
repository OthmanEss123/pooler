// src/common/guards/roles.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const { user } = ctx.switchToHttp().getRequest();

    // API Key avec scope FULL → accès autorisé
    if (user?.role === 'API_KEY') {
      if (user.scope === 'FULL') return true;
      throw new ForbiddenException(
        `Scope insuffisant. Requis: FULL, recu: ${user.scope ?? 'undefined'}`,
      );
    }

    // User normal → vérifier le rôle
    if (!required.includes(user?.role)) {
      throw new ForbiddenException(
        `Role insuffisant. Requis: ${required.join(' ou ')}, recu: ${user?.role}`,
      );
    }

    return true;
  }
}