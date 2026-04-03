import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { AuthRequest } from '../types/auth-request';

@Injectable()
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly configService: ConfigService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const hostType = host.getType<'http' | 'rpc' | 'ws'>();

    if (hostType !== 'http') {
      throw exception;
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<AuthRequest>();
    const nodeEnv = this.configService.get<string>(
      'app.nodeEnv',
      'development',
    );
    const isProd = nodeEnv === 'production';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorResponse: unknown = 'Internal server error';
    let stack: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      errorResponse = exception.getResponse();
      stack = exception.stack;
    } else if (exception instanceof Error) {
      errorResponse = exception.message;
      stack = exception.stack;
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        JSON.stringify({
          requestId: request.requestId ?? null,
          method: request.method,
          path: request.originalUrl ?? request.url,
          statusCode: status,
          userId: request.user?.id ?? null,
          tenantId: request.user?.tenantId ?? null,
          error:
            exception instanceof Error ? exception.message : 'Unknown error',
        }),
        stack,
      );
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.originalUrl ?? request.url,
      method: request.method,
      requestId: request.requestId ?? null,
      error: errorResponse,
      ...(isProd ? {} : { stack }),
    });
  }
}
