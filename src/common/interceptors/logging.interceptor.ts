import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable, tap } from 'rxjs';
import type { AuthRequest } from '../types/auth-request';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<AuthRequest>();
    const res = http.getResponse<Response>();
    const startedAt = req.startedAt ?? Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Date.now() - startedAt;
          this.logger.log(
            JSON.stringify({
              requestId: req.requestId ?? null,
              method: req.method,
              path: req.originalUrl ?? req.url,
              statusCode: res.statusCode,
              durationMs,
              tenantId: req.user?.tenantId ?? null,
              userId: req.user?.id ?? null,
              ip: req.ip,
              userAgent: req.get('user-agent') ?? null,
            }),
          );
        },
        error: (error: unknown) => {
          const durationMs = Date.now() - startedAt;
          const statusCode =
            error instanceof HttpException ? error.getStatus() : 500;

          this.logger.error(
            JSON.stringify({
              requestId: req.requestId ?? null,
              method: req.method,
              path: req.originalUrl ?? req.url,
              statusCode,
              durationMs,
              tenantId: req.user?.tenantId ?? null,
              userId: req.user?.id ?? null,
              error: error instanceof Error ? error.message : 'Unknown error',
            }),
            error instanceof Error ? error.stack : undefined,
          );
        },
      }),
    );
  }
}
