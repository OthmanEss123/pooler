import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClickHouseClient, createClient } from '@clickhouse/client';

@Injectable()
export class ClickhouseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ClickhouseService.name);
  private client: ClickHouseClient | null = null;
  private connected = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    try {
      this.client = createClient({
        url: this.configService.getOrThrow<string>('CLICKHOUSE_URL'),
        username: this.configService.get<string>('CLICKHOUSE_USER', 'default'),
        password: this.configService.get<string>('CLICKHOUSE_PASSWORD', ''),
        database: this.configService.get<string>('CLICKHOUSE_DB', 'pilot'),
      });

      await this.ensureSchema();
      this.connected = true;
      this.logger.log('ClickHouse connected');
    } catch (error) {
      this.connected = false;
      this.logger.error(
        'ClickHouse connection failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.close();
    }
  }

  async ping(): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      await this.client.ping();
      return true;
    } catch (error) {
      this.logger.error(
        'ClickHouse ping failed',
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  async exec(sql: string): Promise<void> {
    await this.command(sql);
  }

  async command(
    sql: string,
    queryParams: Record<string, unknown> = {},
  ): Promise<void> {
    await this.getClient().command({
      query: sql,
      query_params: queryParams,
    });
  }

  async query<T = unknown>(
    sql: string,
    queryParams: Record<string, unknown> = {},
  ): Promise<T[]> {
    const result = await this.getClient().query({
      query: sql,
      query_params: queryParams,
      format: 'JSONEachRow',
    });

    return await result.json();
  }

  async insert<T extends Record<string, unknown>>(
    table: string,
    values: T[],
  ): Promise<void> {
    await this.getClient().insert({
      table,
      values,
      format: 'JSONEachRow',
    });
  }

  async isHealthy(): Promise<boolean> {
    if (!this.connected || !this.client) {
      return false;
    }

    try {
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }

  private async ensureSchema(): Promise<void> {
    await this.exec(`
      CREATE TABLE IF NOT EXISTS metrics_daily
      (
        tenant_id String,
        date Date,
        revenue Float64,
        orders UInt32,
        ads_spend Float64,
        sessions UInt32,
        new_contacts UInt32
      )
      ENGINE = SummingMergeTree()
      PARTITION BY toYYYYMM(date)
      ORDER BY (tenant_id, date)
    `);

    await this.exec(`
      CREATE TABLE IF NOT EXISTS ad_metrics_daily
      (
        tenant_id String,
        campaign_id String,
        date Date,
        spend Float64,
        impressions UInt32,
        clicks UInt32,
        conversions UInt32,
        conversion_value Float64
      )
      ENGINE = SummingMergeTree()
      PARTITION BY toYYYYMM(date)
      ORDER BY (tenant_id, campaign_id, date)
    `);
  }

  private getClient(): ClickHouseClient {
    if (!this.client) {
      throw new Error('ClickHouse client is not initialized');
    }

    return this.client;
  }
}
