import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';

type MemoryEntry = {
  value: string;
  expiresAt: number | null;
};

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly redisUrl: string;
  private readonly client?: IORedis;
  private readonly memoryStore = new Map<string, MemoryEntry>();

  constructor(private readonly configService: ConfigService) {
    this.redisUrl = this.configService.get<string>(
      'REDIS_URL',
      'redis://localhost:6379',
    );

    if ((process.env.NODE_ENV ?? 'development') !== 'test') {
      this.client = new IORedis(this.redisUrl, {
        maxRetriesPerRequest: 1,
        enableReadyCheck: false,
        lazyConnect: true,
      });
    }
  }

  getConnectionOptions(): { url: string } {
    return { url: this.redisUrl };
  }

  private async ensureConnected(): Promise<void> {
    if (this.client?.status === 'wait') {
      await this.client.connect();
    }
  }

  private getMemoryEntry(key: string): string | null {
    const entry = this.memoryStore.get(key);
    if (!entry) {
      return null;
    }

    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.memoryStore.delete(key);
      return null;
    }

    return entry.value;
  }

  async ping(): Promise<string> {
    if (!this.client) {
      return 'PONG';
    }

    try {
      await this.ensureConnected();
      return await this.client.ping();
    } catch (error) {
      this.logger.error(
        'Redis ping failed',
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      return (await this.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) {
      return this.getMemoryEntry(key);
    }

    await this.ensureConnected();
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.client) {
      this.memoryStore.set(key, {
        value,
        expiresAt:
          ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null,
      });
      return;
    }

    await this.ensureConnected();

    if (ttlSeconds && ttlSeconds > 0) {
      await this.client.set(key, value, 'EX', ttlSeconds);
      return;
    }

    await this.client.set(key, value);
  }

  async del(key: string): Promise<number> {
    if (!this.client) {
      return this.memoryStore.delete(key) ? 1 : 0;
    }

    await this.ensureConnected();
    return this.client.del(key);
  }

  async onModuleDestroy(): Promise<void> {
    this.memoryStore.clear();

    if (!this.client) {
      return;
    }

    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}
