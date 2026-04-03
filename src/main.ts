import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { grpcServerOptions } from './grpc/grpc.options';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');
  const nodeEnv = configService.get<string>('app.nodeEnv', 'development');
  const frontendUrl = configService.get<string>('app.frontendUrl', '');
  const grpcHost = configService.get<string>('grpc.host', '127.0.0.1');
  const grpcPort = configService.get<number>('grpc.port', 50051);

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
    ],
    exposedHeaders: ['X-Request-ID'],
  });

  app.connectMicroservice(grpcServerOptions);

  const port = configService.get<number>('app.port', 3000);
  await app.startAllMicroservices();
  await app.listen(port);

  logger.log(`API started on http://localhost:${port}/api/v1`);
  logger.log(`Health check on http://localhost:${port}/api/v1/health`);
  logger.log(`gRPC server started on ${grpcHost}:${grpcPort}`);
}

void bootstrap();
