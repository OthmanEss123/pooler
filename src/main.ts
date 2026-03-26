import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.use(cookieParser());
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
    origin: configService.get<string>(
      'app.frontendUrl',
      'http://localhost:3001',
    ),
    credentials: true,
  });

  const port = configService.get<number>('app.port', 3000);
  await app.listen(port);

  logger.log(`API started on http://localhost:${port}/api/v1`);
  logger.log(`Health check on http://localhost:${port}/api/v1/health`);
}

void bootstrap();
