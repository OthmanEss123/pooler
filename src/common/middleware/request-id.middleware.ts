import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../types/auth-request';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: AuthRequest, res: Response, next: NextFunction): void {
    const headerValue = req.headers['x-request-id'];
    const requestId =
      (Array.isArray(headerValue) ? headerValue[0] : headerValue)?.toString() ||
      randomUUID();

    req.requestId = requestId;
    req.startedAt = Date.now();

    res.setHeader('X-Request-ID', requestId);

    next();
  }
}
