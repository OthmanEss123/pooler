import {
  BadRequestException,
  Injectable,
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
import { EncryptionService } from '../../../common/services/encryption.service';
import { ClickhouseService } from '../../../database/clickhouse/clickhouse.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { SyncQueueService } from '../../../queue/services/sync-queue.service';

type GoogleAdsCredentials = {
  refreshToken: string;
  customerId: string;
};

type GoogleOAuthTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
};

type GoogleAdsRow = {
  campaign?: {
    id?: string | number;
    name?: string;
    status?: string;
    advertisingChannelType?: string;
  };
  campaignBudget?: {
    amountMicros?: string | number;
  };
  metrics?: {
    costMicros?: string | number;
    impressions?: string | number;
    clicks?: string | number;
    conversions?: string | number;
    conversionsValue?: string | number;
  };
  segments?: {
    date?: string;
  };
};

@Injectable()
export class GoogleAdsService {
  private readonly oauthBaseUrl =
    'https://accounts.google.com/o/oauth2/v2/auth';
  private readonly tokenUrl = 'https://oauth2.googleapis.com/token';

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly encryptionService: EncryptionService,
    private readonly syncQueueService: SyncQueueService,
    private readonly clickhouseService: ClickhouseService,
  ) {}

  getOAuthUrl(tenantId: string) {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const redirectUri = this.configService.get<string>(
      'GOOGLE_ADS_REDIRECT_URI',
    );

    if (!clientId || !redirectUri) {
      throw new BadRequestException('Configuration Google OAuth manquante');
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      state: tenantId,
      scope: [
        'https://www.googleapis.com/auth/adwords',
        'https://www.googleapis.com/auth/analytics.readonly',
      ].join(' '),
    });

    return {
      url: `${this.oauthBaseUrl}?${params.toString()}`,
    };
  }

  async handleOAuthCallback(tenantId: string, code: string) {
    if (!code) {
      throw new BadRequestException('Code OAuth manquant');
    }

    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri = this.configService.get<string>(
      'GOOGLE_ADS_REDIRECT_URI',
    );

    if (!clientId || !clientSecret || !redirectUri) {
      throw new BadRequestException('Configuration OAuth incompl�te');
    }

    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new BadRequestException(`OAuth callback failed: ${errorText}`);
    }

    const tokens = (await response.json()) as GoogleOAuthTokenResponse;

    if (!tokens.refresh_token) {
      throw new BadRequestException(
        'Aucun refresh_token re�u. V�rifie prompt=consent et access_type=offline.',
      );
    }

    return {
      success: true,
      tenantId,
      refreshToken: tokens.refresh_token,
      message:
        'Refresh token r�cup�r�. Le customerId doit �tre fourni s�par�ment pour connecter le compte Google Ads.',
    };
  }

  async connect(tenantId: string, refreshToken: string, customerId: string) {
    if (!refreshToken || !customerId) {
      throw new BadRequestException('refreshToken et customerId sont requis');
    }

    const normalizedCustomerId = this.normalizeCustomerId(customerId);
    const encryptedCredentials = this.encryptionService.encryptJson({
      refreshToken,
      customerId: normalizedCustomerId,
    });

    const connectedAt = new Date().toISOString();
    const integration = await this.prisma.integration.upsert({
      where: {
        tenantId_type: {
          tenantId,
          type: IntegrationType.GOOGLE_ADS,
        },
      },
      update: {
        status: IntegrationStatus.ACTIVE,
        credentials: encryptedCredentials,
        metadata: {
          provider: 'google-ads',
          customerId: normalizedCustomerId,
          connectedAt,
        } as Prisma.JsonObject,
      },
      create: {
        tenantId,
        type: IntegrationType.GOOGLE_ADS,
        status: IntegrationStatus.ACTIVE,
        credentials: encryptedCredentials,
        metadata: {
          provider: 'google-ads',
          customerId: normalizedCustomerId,
          connectedAt,
        } as Prisma.JsonObject,
      },
    });

    await this.syncQueueService.syncGoogleAds(tenantId);

    return {
      success: true,
      integrationId: integration.id,
      status: integration.status,
    };
  }

  async disconnect(tenantId: string) {
    const integration = await this.getIntegration(tenantId);

    const updatedIntegration = await this.prisma.integration.update({
      where: { id: integration.id },
      data: {
        status: IntegrationStatus.DISCONNECTED,
        credentials: null,
        metadata: {
          provider: 'google-ads',
          disconnectedAt: new Date().toISOString(),
        } as Prisma.JsonObject,
      },
    });

    return {
      success: true,
      integrationId: updatedIntegration.id,
      status: updatedIntegration.status,
    };
  }

  async syncCampaigns(tenantId: string) {
    const integration = await this.getActiveIntegration(tenantId);
    const credentials = this.getDecryptedCredentials(integration.credentials);
    const accessToken = await this.getAccessToken(credentials.refreshToken);
    const rows = await this.fetchCampaigns({
      accessToken,
      customerId: credentials.customerId,
    });

    let syncedCount = 0;

    for (const row of rows) {
      const campaign = row.campaign;
      if (!campaign?.id) {
        continue;
      }

      const metrics = row.metrics ?? {};
      const budget = row.campaignBudget ?? {};

      await this.prisma.adCampaign.upsert({
        where: {
          tenantId_externalId: {
            tenantId,
            externalId: String(campaign.id),
          },
        },
        update: {
          name: campaign.name ?? `Campaign ${String(campaign.id)}`,
          type: this.mapCampaignType(campaign.advertisingChannelType),
          status: this.mapCampaignStatus(campaign.status),
          budgetDaily: this.toMoneyDecimal(budget.amountMicros),
          spend:
            this.toMoneyDecimal(metrics.costMicros) ?? new Prisma.Decimal(0),
          impressions: Number(metrics.impressions ?? 0),
          clicks: Number(metrics.clicks ?? 0),
          conversions: new Prisma.Decimal(Number(metrics.conversions ?? 0)),
          conversionValue: new Prisma.Decimal(
            Number(metrics.conversionsValue ?? 0),
          ),
          roas: this.computeRoas(metrics.conversionsValue, metrics.costMicros),
          syncedAt: new Date(),
        },
        create: {
          tenantId,
          externalId: String(campaign.id),
          name: campaign.name ?? `Campaign ${String(campaign.id)}`,
          type: this.mapCampaignType(campaign.advertisingChannelType),
          status: this.mapCampaignStatus(campaign.status),
          budgetDaily: this.toMoneyDecimal(budget.amountMicros),
          spend:
            this.toMoneyDecimal(metrics.costMicros) ?? new Prisma.Decimal(0),
          impressions: Number(metrics.impressions ?? 0),
          clicks: Number(metrics.clicks ?? 0),
          conversions: new Prisma.Decimal(Number(metrics.conversions ?? 0)),
          conversionValue: new Prisma.Decimal(
            Number(metrics.conversionsValue ?? 0),
          ),
          roas: this.computeRoas(metrics.conversionsValue, metrics.costMicros),
          syncedAt: new Date(),
        },
      });

      syncedCount += 1;
    }

    await this.prisma.integration.update({
      where: { id: integration.id },
      data: { lastSyncAt: new Date() },
    });

    return {
      success: true,
      syncedCount,
    };
  }

  async syncMetrics(tenantId: string, dateFrom: string, dateTo: string) {
    const normalizedDateFrom = this.normalizeDate(dateFrom);
    const normalizedDateTo = this.normalizeDate(dateTo);

    if (normalizedDateFrom > normalizedDateTo) {
      throw new BadRequestException(
        'dateFrom doit �tre ant�rieure ou �gale � dateTo',
      );
    }

    const integration = await this.getActiveIntegration(tenantId);
    const credentials = this.getDecryptedCredentials(integration.credentials);
    const accessToken = await this.getAccessToken(credentials.refreshToken);
    const rows = await this.fetchMetrics({
      accessToken,
      customerId: credentials.customerId,
      dateFrom: normalizedDateFrom,
      dateTo: normalizedDateTo,
    });

    let syncedCount = 0;

    for (const row of rows) {
      const campaign = row.campaign;
      const date = row.segments?.date;

      if (!campaign?.id || !date) {
        continue;
      }

      const metrics = row.metrics ?? {};

      await this.prisma.adCampaign.upsert({
        where: {
          tenantId_externalId: {
            tenantId,
            externalId: String(campaign.id),
          },
        },
        update: {
          name: campaign.name ?? `Campaign ${String(campaign.id)}`,
          type: this.mapCampaignType(campaign.advertisingChannelType),
          status: this.mapCampaignStatus(campaign.status),
          spend:
            this.toMoneyDecimal(metrics.costMicros) ?? new Prisma.Decimal(0),
          impressions: Number(metrics.impressions ?? 0),
          clicks: Number(metrics.clicks ?? 0),
          conversions: new Prisma.Decimal(Number(metrics.conversions ?? 0)),
          conversionValue: new Prisma.Decimal(
            Number(metrics.conversionsValue ?? 0),
          ),
          roas: this.computeRoas(metrics.conversionsValue, metrics.costMicros),
          syncedAt: new Date(),
        },
        create: {
          tenantId,
          externalId: String(campaign.id),
          name: campaign.name ?? `Campaign ${String(campaign.id)}`,
          type: this.mapCampaignType(campaign.advertisingChannelType),
          status: this.mapCampaignStatus(campaign.status),
          spend:
            this.toMoneyDecimal(metrics.costMicros) ?? new Prisma.Decimal(0),
          impressions: Number(metrics.impressions ?? 0),
          clicks: Number(metrics.clicks ?? 0),
          conversions: new Prisma.Decimal(Number(metrics.conversions ?? 0)),
          conversionValue: new Prisma.Decimal(
            Number(metrics.conversionsValue ?? 0),
          ),
          roas: this.computeRoas(metrics.conversionsValue, metrics.costMicros),
          syncedAt: new Date(),
        },
      });

      await this.clickhouseService.insert('ad_metrics_daily', [
        {
          tenant_id: tenantId,
          campaign_id: String(campaign.id),
          date,
          spend: Number(metrics.costMicros ?? 0) / 1_000_000,
          impressions: Number(metrics.impressions ?? 0),
          clicks: Number(metrics.clicks ?? 0),
          conversions: Number(metrics.conversions ?? 0),
          conversion_value: Number(metrics.conversionsValue ?? 0),
        },
      ]);

      syncedCount += 1;
    }

    await this.prisma.integration.update({
      where: { id: integration.id },
      data: { lastSyncAt: new Date() },
    });

    return {
      success: true,
      syncedCount,
      dateFrom: normalizedDateFrom,
      dateTo: normalizedDateTo,
    };
  }

  async syncAudienceFromSegment(
    tenantId: string,
    segmentId: string,
    audienceName: string,
  ) {
    const segment = await this.prisma.segment.findFirst({
      where: {
        id: segmentId,
        tenantId,
      },
    });

    if (!segment) {
      throw new NotFoundException('Segment introuvable');
    }

    const contacts = await this.prisma.contact.findMany({
      where: {
        tenantId,
        segmentMembers: {
          some: {
            segmentId,
          },
        },
      },
      select: {
        id: true,
        email: true,
      },
    });

    const audience = await this.prisma.adAudience.upsert({
      where: {
        tenantId_name: {
          tenantId,
          name: audienceName,
        },
      },
      update: {
        segmentId,
        memberCount: contacts.length,
        lastSyncAt: new Date(),
      },
      create: {
        tenantId,
        segmentId,
        name: audienceName,
        memberCount: contacts.length,
        lastSyncAt: new Date(),
      },
    });

    await this.prisma.adAudienceMember.deleteMany({
      where: {
        audienceId: audience.id,
      },
    });

    if (contacts.length > 0) {
      await this.prisma.adAudienceMember.createMany({
        data: contacts.map((contact) => ({
          audienceId: audience.id,
          contactId: contact.id,
        })),
        skipDuplicates: true,
      });
    }

    return {
      success: true,
      audienceId: audience.id,
      emailCount: contacts.length,
    };
  }

  async listCampaigns(tenantId: string) {
    return this.prisma.adCampaign.findMany({
      where: { tenantId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getCampaignById(tenantId: string, id: string) {
    const campaign = await this.prisma.adCampaign.findFirst({
      where: {
        tenantId,
        id,
      },
    });

    if (!campaign) {
      throw new NotFoundException('Campagne introuvable');
    }

    return campaign;
  }

  private async getIntegration(tenantId: string) {
    const integration = await this.prisma.integration.findUnique({
      where: {
        tenantId_type: {
          tenantId,
          type: IntegrationType.GOOGLE_ADS,
        },
      },
    });

    if (!integration) {
      throw new NotFoundException('Int�gration Google Ads introuvable');
    }

    return integration;
  }

  private async getActiveIntegration(tenantId: string) {
    const integration = await this.getIntegration(tenantId);

    if (integration.status !== IntegrationStatus.ACTIVE) {
      throw new BadRequestException('Int�gration Google Ads inactive');
    }

    return integration;
  }

  private getDecryptedCredentials(
    encrypted: string | null,
  ): GoogleAdsCredentials {
    if (!encrypted) {
      throw new BadRequestException('Credentials Google Ads manquants');
    }

    return this.encryptionService.decryptJson<GoogleAdsCredentials>(encrypted);
  }

  private async getAccessToken(refreshToken: string): Promise<string> {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new BadRequestException('Configuration OAuth incompl�te');
    }

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });

    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new BadRequestException(
        `Impossible de r�cup�rer access_token: ${errorText}`,
      );
    }

    const data = (await response.json()) as GoogleOAuthTokenResponse;
    return data.access_token;
  }

  private async fetchCampaigns(params: {
    accessToken: string;
    customerId: string;
  }): Promise<GoogleAdsRow[]> {
    const query = `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        campaign_budget.amount_micros,
        metrics.cost_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        metrics.conversions_value
      FROM campaign
    `;

    return this.searchStream({
      accessToken: params.accessToken,
      customerId: params.customerId,
      query,
    });
  }

  private async fetchMetrics(params: {
    accessToken: string;
    customerId: string;
    dateFrom: string;
    dateTo: string;
  }): Promise<GoogleAdsRow[]> {
    const query = `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        segments.date,
        metrics.cost_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        metrics.conversions_value
      FROM campaign
      WHERE segments.date BETWEEN '${params.dateFrom}' AND '${params.dateTo}'
    `;

    return this.searchStream({
      accessToken: params.accessToken,
      customerId: params.customerId,
      query,
    });
  }

  private async searchStream(params: {
    accessToken: string;
    customerId: string;
    query: string;
  }): Promise<GoogleAdsRow[]> {
    const developerToken = this.configService.get<string>(
      'GOOGLE_ADS_DEVELOPER_TOKEN',
    );
    const loginCustomerId = this.configService.get<string>(
      'GOOGLE_ADS_LOGIN_CUSTOMER_ID',
    );
    const apiVersion =
      this.configService.get<string>('GOOGLE_ADS_API_VERSION') || 'v22';

    if (!developerToken) {
      throw new BadRequestException('GOOGLE_ADS_DEVELOPER_TOKEN manquant');
    }

    const response = await fetch(
      `https://googleads.googleapis.com/${apiVersion}/customers/${params.customerId}/googleAds:searchStream`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          'Content-Type': 'application/json',
          'developer-token': developerToken,
          ...(loginCustomerId ? { 'login-customer-id': loginCustomerId } : {}),
        },
        body: JSON.stringify({ query: params.query }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new BadRequestException(`Google Ads request failed: ${errorText}`);
    }

    const data = (await response.json()) as Array<{ results?: GoogleAdsRow[] }>;
    return data.flatMap((item) => item.results ?? []);
  }

  private normalizeCustomerId(customerId: string) {
    return customerId.replace(/-/g, '').trim();
  }

  private normalizeDate(value: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Date invalide');
    }

    return date.toISOString().slice(0, 10);
  }

  private toMoneyDecimal(value?: string | number) {
    if (value === null || value === undefined) {
      return null;
    }

    return new Prisma.Decimal(Number(value) / 1_000_000);
  }

  private computeRoas(
    conversionValue?: string | number,
    costMicros?: string | number,
  ) {
    const conv = Number(conversionValue ?? 0);
    const cost = Number(costMicros ?? 0) / 1_000_000;

    if (cost <= 0) {
      return new Prisma.Decimal(0);
    }

    return new Prisma.Decimal(conv / cost);
  }

  private mapCampaignType(value?: string): AdCampaignType {
    switch (value) {
      case 'SEARCH':
        return AdCampaignType.SEARCH;
      case 'SHOPPING':
        return AdCampaignType.SHOPPING;
      case 'PERFORMANCE_MAX':
        return AdCampaignType.PERFORMANCE_MAX;
      case 'DISPLAY':
        return AdCampaignType.DISPLAY;
      case 'VIDEO':
        return AdCampaignType.VIDEO;
      default:
        return AdCampaignType.SEARCH;
    }
  }

  private mapCampaignStatus(value?: string): AdCampaignStatus {
    switch (value) {
      case 'ENABLED':
        return AdCampaignStatus.ENABLED;
      case 'PAUSED':
        return AdCampaignStatus.PAUSED;
      case 'REMOVED':
        return AdCampaignStatus.REMOVED;
      default:
        return AdCampaignStatus.PAUSED;
    }
  }
}
