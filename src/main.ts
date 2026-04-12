import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { getQueueToken } from '@nestjs/bullmq';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { createBullBoard } from '@bull-board/api';
import { ExpressAdapter } from '@bull-board/express';
import * as Sentry from '@sentry/node';
import type { Request, Response, NextFunction } from 'express';
import type { Queue } from 'bullmq';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');
  const nodeEnv = configService.get<string>('app.nodeEnv', 'development');
  const frontendUrl = configService.get<string>('app.frontendUrl', '');
  const sentryDsn = configService.get<string>('SENTRY_DSN');

  if (nodeEnv === 'production' && sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      environment: nodeEnv,
      tracesSampleRate: 0.1,
    });
  }

  app.use(cookieParser());
  app.use(
    helmet({
      frameguard: { action: 'deny' },
      noSniff: true,
      contentSecurityPolicy:
        nodeEnv === 'production' && frontendUrl
          ? {
              directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", 'data:', frontendUrl],
                connectSrc: ["'self'", frontendUrl],
                objectSrc: ["'none'"],
                frameAncestors: ["'none'"],
                baseUri: ["'self'"],
                formAction: ["'self'"],
              },
            }
          : false,
    }),
  );
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.enableCors({
    origin:
      nodeEnv === 'production'
        ? (
            origin: string | undefined,
            callback: (error: Error | null, allow?: boolean) => void,
          ) => {
            if (!origin || origin === frontendUrl) {
              return callback(null, true);
            }

            return callback(new Error('CORS origin not allowed'), false);
          }
        : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-ID',
      'X-API-Key',
      'X-Metrics-Token',
      'x-api-key',
      'x-metrics-token',
      'x-admin-token',
    ],
    exposedHeaders: ['X-Request-ID'],
  });

  registerBullBoard(app, configService, logger);

  const port = configService.get<number>('app.port', 3000);
  await app.listen(port);

  logger.log(`API started on http://localhost:${port}/api/v1`);
  logger.log(`Health check on http://localhost:${port}/api/v1/health`);
}

function registerBullBoard(
  app: Awaited<ReturnType<typeof NestFactory.create>>,
  configService: ConfigService,
  logger: Logger,
) {
  const queueEnabled = configService.get<boolean>('QUEUE_ENABLED', true);
  const adminToken = configService.get<string>('ADMIN_TOKEN');

  if (!queueEnabled || !adminToken) {
    return;
  }

  try {
    const queueNames = ['sync'] as const;
    const queues = queueNames
      .map((name) => app.get<Queue>(getQueueToken(name), { strict: false }))
      .filter((queue): queue is Queue => Boolean(queue))
      .map((queue) => new BullMQAdapter(queue));

    if (queues.length === 0) {
      return;
    }

    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/admin/queues');

    createBullBoard({
      queues,
      serverAdapter,
    });

    app.use(
      '/admin/queues',
      (req: Request, res: Response, next: NextFunction) => {
        const token = req.headers['x-admin-token'];
        if (token !== adminToken) {
          return res.status(401).json({ error: 'Non autorise' });
        }

        return next();
      },
      serverAdapter.getRouter(),
    );

    logger.log('Bull Board available on /admin/queues');
  } catch (error) {
    logger.warn(
      `Bull Board not initialized: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

void bootstrap();
