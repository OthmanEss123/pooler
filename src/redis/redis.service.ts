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
  private redisAvailable = true;
  private redisWarningLogged = false;

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
        retryStrategy: () => null,
      });
      this.client.on('error', (error) => {
        this.markRedisUnavailable(error);
      });
    }
  }

  getConnectionOptions(): { url: string } {
    return { url: this.redisUrl };
  }

  private async ensureConnected(): Promise<void> {
    if (!this.client || !this.redisAvailable) {
      return;
    }

    if (this.client?.status === 'wait') {
      try {
        await this.client.connect();
      } catch (error) {
        this.markRedisUnavailable(error);
        throw error;
      }
    }
  }

  private shouldUseMemory(): boolean {
    return !this.client || !this.redisAvailable || this.client.status === 'end';
  }

  private markRedisUnavailable(error: unknown): void {
    this.redisAvailable = false;

    if (this.redisWarningLogged) {
      return;
    }

    this.redisWarningLogged = true;
    this.logger.warn(
      `Redis unavailable, using in-memory fallback: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
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
    if (this.shouldUseMemory()) {
      return 'PONG';
    }

    try {
      await this.ensureConnected();
      return await this.client!.ping();
    } catch (error) {
      this.markRedisUnavailable(error);
      return 'PONG';
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      return this.shouldUseMemory() || (await this.ping()) === 'PONG';
    } catch {
      return this.shouldUseMemory();
    }
  }

  async get(key: string): Promise<string | null> {
    if (this.shouldUseMemory()) {
      return this.getMemoryEntry(key);
    }

    try {
      await this.ensureConnected();
      return await this.client!.get(key);
    } catch (error) {
      this.markRedisUnavailable(error);
      return this.getMemoryEntry(key);
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.shouldUseMemory()) {
      this.memoryStore.set(key, {
        value,
        expiresAt:
          ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null,
      });
      return;
    }

    try {
      await this.ensureConnected();

      if (ttlSeconds && ttlSeconds > 0) {
        await this.client!.set(key, value, 'EX', ttlSeconds);
        return;
      }

      await this.client!.set(key, value);
    } catch (error) {
      this.markRedisUnavailable(error);
      this.memoryStore.set(key, {
        value,
        expiresAt:
          ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null,
      });
      return;
    }
  }

  async del(key: string): Promise<number> {
    if (this.shouldUseMemory()) {
      return this.memoryStore.delete(key) ? 1 : 0;
    }

    try {
      await this.ensureConnected();
      return await this.client!.del(key);
    } catch (error) {
      this.markRedisUnavailable(error);
      return this.memoryStore.delete(key) ? 1 : 0;
    }
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
