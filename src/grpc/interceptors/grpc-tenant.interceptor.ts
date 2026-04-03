import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  UnauthorizedException,
} from '@nestjs/common';
import { Observable } from 'rxjs';

const GRPC_SHARED_SECRET = process.env.GRPC_SHARED_SECRET ?? '';

@Injectable()
export class GrpcAuthInterceptor implements NestInterceptor {
  private readonly logger = new Logger(GrpcAuthInterceptor.name);

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'rpc') {
      return next.handle();
    }

    const data: unknown = ctx.switchToRpc().getData();
    const tenantId = this.extractTenantId(data);

    if (!tenantId) {
      throw new UnauthorizedException(
        'tenant_id manquant dans le payload gRPC',
      );
    }

    if (GRPC_SHARED_SECRET) {
      const secret =
        data && typeof data === 'object'
          ? (data as Record<string, unknown>).grpc_secret
          : undefined;

      if (secret !== GRPC_SHARED_SECRET) {
        this.logger.warn(`Appel gRPC sans secret valide - tenant: ${tenantId}`);
        throw new UnauthorizedException('Secret gRPC invalide');
      }
    }

    return next.handle();
  }

  private extractTenantId(data: unknown): string | null {
    if (!data || typeof data !== 'object') {
      return null;
    }

    const record = data as Record<string, unknown>;

    if (typeof record.tenant_id === 'string' && record.tenant_id.length > 0) {
      return record.tenant_id;
    }

    if (typeof record.tenantId === 'string' && record.tenantId.length > 0) {
      return record.tenantId;
    }

    if (!Array.isArray(record.contacts) || record.contacts.length === 0) {
      return null;
    }

    const tenantIds = new Set(
      record.contacts
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return undefined;
          }

          const contact = item as Record<string, unknown>;
          return typeof contact.tenantId === 'string' &&
            contact.tenantId.length > 0
            ? contact.tenantId
            : undefined;
        })
        .filter((tenantId): tenantId is string => Boolean(tenantId)),
    );

    return tenantIds.size === 1 ? [...tenantIds][0] : null;
  }
}
