import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AdCampaignStatus,
  AdCampaignType,
  IntegrationStatus,
  IntegrationType,
  Prisma,
} from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { EncryptionService } from '../../../common/services/encryption.service';
import { ClickhouseService } from '../../../database/clickhouse/clickhouse.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import { FacebookAdsApiClient } from './facebook-ads-api.client';
import { FacebookAdsMapper } from './facebook-ads-mapper';
import { ConnectFacebookDto } from './dto/connect-facebook.dto';

type FacebookCredentials = {
  accessToken: string;
  adAccountId: string;
};

@Injectable()
export class FacebookAdsService {
  private readonly logger = new Logger(FacebookAdsService.name);
  private readonly oauthStateTtlSec = 600;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly encryption: EncryptionService,
    private readonly redis: RedisService,
    private readonly graph: FacebookAdsApiClient,
    private readonly clickhouse: ClickhouseService,
  ) {}

  normalizeAdAccountId(raw: string): string {
    const t = raw.trim();
    if (t.startsWith('act_')) {
      return t;
    }
    return `act_${t.replace(/^act_/, '')}`;
  }

  async getOAuthUrl(tenantId: string): Promise<{ url: string }> {
    const appId = this.config.get<string>('FACEBOOK_APP_ID');
    const redirectUri = this.config.get<string>('FACEBOOK_REDIRECT_URI');

    if (!appId || !redirectUri) {
      throw new BadRequestException(
        'Facebook app non configurée (APP_ID / REDIRECT_URI)',
      );
    }

    const state = randomBytes(16).toString('hex');
    const key = `fb:oauth:${state}`;
    await this.redis.set(
      key,
      JSON.stringify({ tenantId }),
      this.oauthStateTtlSec,
    );

    const scope = ['ads_management', 'ads_read', 'business_management'].join(
      ',',
    );
    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      scope,
      state,
      response_type: 'code',
    });

    const url = `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
    return { url };
  }

  async handleOAuthCallback(
    code: string | undefined,
    state: string | undefined,
  ): Promise<{ tenantId: string; tempToken: string }> {
    if (!code) {
      throw new BadRequestException('Code OAuth manquant');
    }
    if (!state) {
      throw new BadRequestException('State manquant');
    }

    const key = `fb:oauth:${state}`;
    const raw = await this.redis.get(key);
    await this.redis.del(key);

    if (!raw) {
      throw new BadRequestException('State invalide ou expiré');
    }

    let tenantId: string;
    try {
      const parsed = JSON.parse(raw) as { tenantId?: string };
      if (!parsed.tenantId) {
        throw new BadRequestException('State invalide');
      }
      tenantId = parsed.tenantId;
    } catch {
      throw new BadRequestException('State invalide');
    }

    const redirectUri = this.config.getOrThrow<string>('FACEBOOK_REDIRECT_URI');
    const short = await this.graph.exchangeCodeForShortToken(code, redirectUri);
    const long = await this.graph.getLongLivedToken(short.access_token);

    return { tenantId, tempToken: long.access_token };
  }

  async connect(tenantId: string, dto: ConnectFacebookDto) {
    const adAccountId = this.normalizeAdAccountId(dto.adAccountId);
    const encrypted = this.encryption.encryptJson({
      accessToken: dto.tempToken,
      adAccountId,
    } satisfies FacebookCredentials);

    const integration = await this.prisma.integration.upsert({
      where: {
        tenantId_type: {
          tenantId,
          type: IntegrationType.FACEBOOK_ADS,
        },
      },
      update: {
        status: IntegrationStatus.ACTIVE,
        credentials: encrypted,
        metadata: {
          provider: 'facebook-ads',
          adAccountId,
          connectedAt: new Date().toISOString(),
        } as Prisma.JsonObject,
      },
      create: {
        tenantId,
        type: IntegrationType.FACEBOOK_ADS,
        status: IntegrationStatus.ACTIVE,
        credentials: encrypted,
        metadata: {
          provider: 'facebook-ads',
          adAccountId,
          connectedAt: new Date().toISOString(),
        } as Prisma.JsonObject,
      },
    });

    return {
      success: true,
      integrationId: integration.id,
      status: integration.status,
    };
  }

  async disconnect(tenantId: string) {
    const existing = await this.prisma.integration.findUnique({
      where: {
        tenantId_type: {
          tenantId,
          type: IntegrationType.FACEBOOK_ADS,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Intégration Facebook Ads introuvable');
    }

    await this.prisma.integration.update({
      where: { id: existing.id },
      data: {
        status: IntegrationStatus.DISCONNECTED,
        credentials: null,
        metadata: {
          provider: 'facebook-ads',
          disconnectedAt: new Date().toISOString(),
        } as Prisma.JsonObject,
      },
    });

    return { success: true };
  }

  async listCampaigns(tenantId: string) {
    return this.prisma.adCampaign.findMany({
      where: { tenantId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async syncCampaigns(tenantId: string) {
    const { accessToken, adAccountId } = await this.getCredentials(tenantId);

    const rows = await this.graph.getAllPages<Record<string, unknown>>(
      `${adAccountId}/campaigns`,
      accessToken,
      {
        fields: 'id,name,status,daily_budget,objective',
        limit: '100',
      },
    );

    let synced = 0;

    for (const row of rows) {
      const id = row?.id;
      if (typeof id !== 'string' && typeof id !== 'number') {
        continue;
      }
      const externalId = String(id);
      const name =
        typeof row.name === 'string' ? row.name : `Campaign ${externalId}`;
      const statusStr = typeof row.status === 'string' ? row.status : undefined;
      const dailyBudgetRaw = row.daily_budget;

      const budgetDaily =
        dailyBudgetRaw !== undefined && dailyBudgetRaw !== null
          ? new Prisma.Decimal(Number(dailyBudgetRaw) / 100)
          : null;

      await this.prisma.adCampaign.upsert({
        where: {
          tenantId_externalId: { tenantId, externalId },
        },
        update: {
          name,
          type: AdCampaignType.SEARCH,
          status: FacebookAdsMapper.mapCampaignStatus(statusStr),
          budgetDaily,
          syncedAt: new Date(),
        },
        create: {
          tenantId,
          externalId,
          name,
          type: AdCampaignType.SEARCH,
          status: FacebookAdsMapper.mapCampaignStatus(statusStr),
          budgetDaily,
          syncedAt: new Date(),
        },
      });
      synced += 1;
    }

    await this.prisma.integration.update({
      where: {
        tenantId_type: {
          tenantId,
          type: IntegrationType.FACEBOOK_ADS,
        },
      },
      data: { lastSyncAt: new Date() },
    });

    return { success: true, syncedCount: synced };
  }

  async syncMetrics(tenantId: string, dateFrom: string, dateTo: string) {
    const from = this.normalizeDate(dateFrom);
    const to = this.normalizeDate(dateTo);

    if (from > to) {
      throw new BadRequestException('dateFrom doit être ≤ dateTo');
    }

    const { accessToken, adAccountId } = await this.getCredentials(tenantId);

    await this.deleteAdMetricsRange(tenantId, from, to);

    const timeRange = JSON.stringify({ since: from, until: to });
    const rows = await this.graph.getAllPages<Record<string, unknown>>(
      `${adAccountId}/insights`,
      accessToken,
      {
        level: 'campaign',
        fields:
          'campaign_id,campaign_name,spend,impressions,clicks,actions,action_values,date_start',
        time_range: timeRange,
        time_increment: '1',
        limit: '500',
      },
    );

    const chRows: Array<{
      tenant_id: string;
      campaign_id: string;
      date: string;
      spend: number;
      impressions: number;
      clicks: number;
      conversions: number;
      conversion_value: number;
    }> = [];

    for (const row of rows) {
      const rawCampaignId = row.campaign_id;
      const campaignId =
        typeof rawCampaignId === 'string' || typeof rawCampaignId === 'number'
          ? String(rawCampaignId)
          : null;
      const dateStart =
        typeof row.date_start === 'string' ? row.date_start : null;

      if (!campaignId || !dateStart) {
        continue;
      }

      const toStr = (v: unknown): string =>
        typeof v === 'string' || typeof v === 'number' ? String(v) : '0';

      const mapped = FacebookAdsMapper.mapMetrics({
        spend: toStr(row.spend),
        impressions: toStr(row.impressions),
        clicks: toStr(row.clicks),
        actions: row.actions as
          | Array<{ action_type?: string; value?: string }>
          | undefined,
        action_values: row.action_values as
          | Array<{ action_type?: string; value?: string }>
          | undefined,
      });

      const name =
        typeof row.campaign_name === 'string'
          ? row.campaign_name
          : `Campaign ${campaignId}`;

      await this.prisma.adCampaign.upsert({
        where: {
          tenantId_externalId: { tenantId, externalId: campaignId },
        },
        update: {
          name,
          type: AdCampaignType.SEARCH,
          spend: new Prisma.Decimal(mapped.spend),
          impressions: mapped.impressions,
          clicks: mapped.clicks,
          conversions: new Prisma.Decimal(mapped.conversions),
          conversionValue: new Prisma.Decimal(mapped.conversionValue),
          roas: new Prisma.Decimal(mapped.roas),
          syncedAt: new Date(),
        },
        create: {
          tenantId,
          externalId: campaignId,
          name,
          type: AdCampaignType.SEARCH,
          status: AdCampaignStatus.ENABLED,
          spend: new Prisma.Decimal(mapped.spend),
          impressions: mapped.impressions,
          clicks: mapped.clicks,
          conversions: new Prisma.Decimal(mapped.conversions),
          conversionValue: new Prisma.Decimal(mapped.conversionValue),
          roas: new Prisma.Decimal(mapped.roas),
          syncedAt: new Date(),
        },
      });

      chRows.push({
        tenant_id: tenantId,
        campaign_id: campaignId,
        date: dateStart,
        spend: mapped.spend,
        impressions: mapped.impressions,
        clicks: mapped.clicks,
        conversions: Math.round(mapped.conversions),
        conversion_value: mapped.conversionValue,
      });
    }

    if (chRows.length > 0) {
      await this.clickhouse.insert('ad_metrics_daily', chRows);
    }

    await this.prisma.integration.update({
      where: {
        tenantId_type: {
          tenantId,
          type: IntegrationType.FACEBOOK_ADS,
        },
      },
      data: { lastSyncAt: new Date() },
    });

    return {
      success: true,
      syncedCount: chRows.length,
      dateFrom: from,
      dateTo: to,
    };
  }

  async syncAudienceFromSegment(tenantId: string, segmentId: string) {
    const segment = await this.prisma.segment.findFirst({
      where: { id: segmentId, tenantId },
    });

    if (!segment) {
      throw new NotFoundException('Segment introuvable');
    }

    const { accessToken, adAccountId } = await this.getCredentials(tenantId);

    const contacts = await this.prisma.contact.findMany({
      where: {
        tenantId,
        segmentMembers: { some: { segmentId } },
      },
      select: { id: true, email: true },
    });

    const audienceName = `Pilot — ${segment.name}`;

    const existingAudiences = await this.graph.getAllPages<{
      id: string;
      name: string;
    }>(`${adAccountId}/customaudiences`, accessToken, {
      fields: 'id,name',
      limit: '200',
    });

    let externalAudienceId: string | null =
      existingAudiences.find((a) => a.name === audienceName)?.id ?? null;

    if (!externalAudienceId) {
      const created = await this.graph.post<{ id: string }>(
        `${adAccountId}/customaudiences`,
        accessToken,
        {
          name: audienceName,
          subtype: 'CUSTOM',
          customer_file_source: 'USER_PROVIDED_ONLY',
        },
      );
      externalAudienceId = created.id;
    }

    const hashes: string[] = [];
    for (const c of contacts) {
      const email = c.email.trim().toLowerCase();
      if (email.length === 0) {
        continue;
      }
      hashes.push(createHash('sha256').update(email, 'utf8').digest('hex'));
    }

    const batchSize = 5000;
    for (let i = 0; i < hashes.length; i += batchSize) {
      const chunk = hashes.slice(i, i + batchSize);
      const data = chunk.map((h) => [h]);
      await this.graph.post(`${externalAudienceId}/users`, accessToken, {
        payload: {
          schema: ['EMAIL'],
          data,
        },
      });
    }

    const audience = await this.prisma.adAudience.upsert({
      where: {
        tenantId_name: { tenantId, name: audienceName },
      },
      update: {
        segmentId,
        externalId: externalAudienceId,
        memberCount: contacts.length,
        lastSyncAt: new Date(),
      },
      create: {
        tenantId,
        segmentId,
        externalId: externalAudienceId,
        name: audienceName,
        memberCount: contacts.length,
        lastSyncAt: new Date(),
      },
    });

    await this.prisma.adAudienceMember.deleteMany({
      where: { audienceId: audience.id },
    });

    if (contacts.length > 0) {
      await this.prisma.adAudienceMember.createMany({
        data: contacts.map((c) => ({
          audienceId: audience.id,
          contactId: c.id,
        })),
        skipDuplicates: true,
      });
    }

    return {
      audienceId: audience.id,
      memberCount: contacts.length,
      facebookAudienceId: externalAudienceId,
    };
  }

  private async deleteAdMetricsRange(
    tenantId: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<void> {
    try {
      await this.clickhouse.command(
        `ALTER TABLE ad_metrics_daily DELETE WHERE tenant_id = {tenantId:String} AND date >= toDate({d1:String}) AND date <= toDate({d2:String})`,
        { tenantId, d1: dateFrom, d2: dateTo },
      );
    } catch (e) {
      this.logger.warn(
        `ClickHouse delete ad_metrics_daily: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  private normalizeDate(value: string): string {
    return value.slice(0, 10);
  }

  private async getCredentials(tenantId: string): Promise<FacebookCredentials> {
    const integration = await this.prisma.integration.findUnique({
      where: {
        tenantId_type: {
          tenantId,
          type: IntegrationType.FACEBOOK_ADS,
        },
      },
    });

    if (
      !integration ||
      integration.status !== IntegrationStatus.ACTIVE ||
      !integration.credentials
    ) {
      throw new NotFoundException('Intégration Facebook Ads introuvable');
    }

    return this.encryption.decryptJson<FacebookCredentials>(
      integration.credentials,
    );
  }
}
