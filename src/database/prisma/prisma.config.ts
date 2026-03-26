import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PrismaConfig {
  constructor(private readonly config: ConfigService) {}

  get databaseUrl(): string {
    return this.config.getOrThrow<string>('DATABASE_URL');
  }
}
