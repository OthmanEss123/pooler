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
import { EncryptionService } from '../../../common/services/encryption.service';
import { ClickhouseService } from '../../../database/clickhouse/clickhouse.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { SyncQueueService } from '../../../queue/services/sync-queue.service';
import { GoogleAdsMapper } from './google-ads-mapper';
import {
  AdCampaignStatusDto,
  AdCampaignTypeDto,
  CreateAdCampaignDto,
} from './dto/create-ad-campaign.dto';
import { CreateAdGroupDto } from './dto/create-ad-group.dto';
import { CreateGoogleAdsBudgetDto } from './dto/create-google-ads-budget.dto';

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
    resourceName?: string;
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
  private readonly logger = new Logger(GoogleAdsService.name);
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
      scope: 'https://www.googleapis.com/auth/adwords',
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
      throw new BadRequestException('Configuration OAuth incomplete');
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
        'Aucun refresh_token recu. Verifie prompt=consent et access_type=offline.',
      );
    }

    return {
      success: true,
      tenantId,
      refreshToken: tokens.refresh_token,
      message:
        'Refresh token recupere. Le customerId doit etre fourni separement pour connecter le compte Google Ads.',
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
        'dateFrom doit etre anterieure ou egale a dateTo',
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

  async pauseCampaign(tenantId: string, id: string) {
    return this.updateCampaignStatus(
      tenantId,
      id,
      'PAUSED',
      AdCampaignStatus.PAUSED,
    );
  }

  async enableCampaign(tenantId: string, id: string) {
    return this.updateCampaignStatus(
      tenantId,
      id,
      'ENABLED',
      AdCampaignStatus.ENABLED,
    );
  }

  async updateBudget(tenantId: string, id: string, budgetMicros: number) {
    const { campaign, accessToken, customerId } =
      await this.getCampaignMutationContext(tenantId, id);
    const budgetResourceName = await this.getCampaignBudgetResourceName(
      accessToken,
      customerId,
      campaign.externalId,
    );

    await this.mutateGoogleAds({
      accessToken,
      customerId,
      mutateOperations: [
        {
          campaignBudgetOperation: {
            updateMask: 'amount_micros',
            update: {
              resourceName: budgetResourceName,
              amountMicros: String(budgetMicros),
            },
          },
        },
      ],
    });

    const budgetDaily = new Prisma.Decimal(budgetMicros / 1_000_000);

    await this.prisma.adCampaign.update({
      where: { id: campaign.id },
      data: { budgetDaily },
    });

    return {
      success: true,
      id: campaign.id,
      budgetDaily,
    };
  }

  private async updateCampaignStatus(
    tenantId: string,
    id: string,
    googleStatus: 'PAUSED' | 'ENABLED',
    status: AdCampaignStatus,
  ) {
    const { campaign, accessToken, customerId } =
      await this.getCampaignMutationContext(tenantId, id);

    await this.mutateGoogleAds({
      accessToken,
      customerId,
      mutateOperations: [
        {
          campaignOperation: {
            updateMask: 'status',
            update: {
              resourceName: this.buildCampaignResourceName(
                customerId,
                campaign.externalId,
              ),
              status: googleStatus,
            },
          },
        },
      ],
    });

    await this.prisma.adCampaign.update({
      where: { id: campaign.id },
      data: { status },
    });

    return {
      success: true,
      id: campaign.id,
      status,
    };
  }

  private async getCampaignMutationContext(tenantId: string, id: string) {
    const campaign = await this.getCampaignById(tenantId, id);
    const integration = await this.getActiveIntegration(tenantId);
    const credentials = this.getDecryptedCredentials(integration.credentials);
    const accessToken = await this.getAccessToken(credentials.refreshToken);

    return {
      campaign,
      accessToken,
      customerId: credentials.customerId,
    };
  }

  private async getCampaignBudgetResourceName(
    accessToken: string,
    customerId: string,
    campaignExternalId: string,
  ) {
    const rows = await this.searchStream({
      accessToken,
      customerId,
      query: `
        SELECT
          campaign.id,
          campaign_budget.resource_name,
          campaign_budget.amount_micros
        FROM campaign
        WHERE campaign.id = ${campaignExternalId}
      `,
    });

    const resourceName = rows[0]?.campaignBudget?.resourceName;

    if (!resourceName) {
      throw new BadRequestException(
        'Budget Google Ads introuvable pour cette campagne',
      );
    }

    return resourceName;
  }

  private buildCampaignResourceName(customerId: string, externalId: string) {
    return `customers/${customerId}/campaigns/${externalId}`;
  }

  private async mutateGoogleAds(params: {
    accessToken: string;
    customerId: string;
    mutateOperations: unknown[];
  }) {
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
      `https://googleads.googleapis.com/${apiVersion}/customers/${params.customerId}/googleAds:mutate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          'Content-Type': 'application/json',
          'developer-token': developerToken,
          ...(loginCustomerId ? { 'login-customer-id': loginCustomerId } : {}),
        },
        body: JSON.stringify({
          mutateOperations: params.mutateOperations,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new BadRequestException(`Google Ads mutate failed: ${errorText}`);
    }

    const data: unknown = await response.json();
    return data;
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
      throw new NotFoundException('Integration Google Ads introuvable');
    }

    return integration;
  }

  private async getActiveIntegration(tenantId: string) {
    const integration = await this.getIntegration(tenantId);

    if (integration.status !== IntegrationStatus.ACTIVE) {
      throw new BadRequestException('Integration Google Ads inactive');
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
      throw new BadRequestException('Configuration OAuth incomplete');
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
        `Impossible de recuperer access_token: ${errorText}`,
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

  async createCampaign(tenantId: string, dto: CreateAdCampaignDto) {
    const { customerId, accessToken } =
      await this.getTenantGoogleAdsContext(tenantId);

    const budgetResourceName =
      dto.budgetResourceName ||
      (await this.createBudget(
        customerId,
        accessToken,
        dto.name,
        dto.budgetDailyMicros,
      ));

    const externalId = await this.createGoogleCampaign(
      customerId,
      accessToken,
      dto,
      budgetResourceName,
    );

    if (dto.targetCountry || dto.targetLanguage) {
      await this.addCampaignCriteria(tenantId, externalId, {
        countries: dto.targetCountry ? [dto.targetCountry] : undefined,
        languages: dto.targetLanguage ? [dto.targetLanguage] : undefined,
      });
    }

    const campaign = await this.persistCampaign(
      tenantId,
      externalId,
      dto.name,
      dto.type,
      dto.budgetDailyMicros,
      this.mapDtoStatusToEntityStatus(dto.status),
    );

    if (dto.audienceSegmentIds?.length) {
      await this.syncAudiencesToCampaign(
        tenantId,
        externalId,
        dto.audienceSegmentIds,
      );
    }

    this.logger.log(
      `Google Ads campaign created ${externalId} for tenant ${tenantId}`,
    );

    return {
      ...campaign,
      budgetResourceName,
      resourceName: this.buildCampaignResourceName(customerId, externalId),
    };
  }

  async createBudgetForTenant(
    tenantId: string,
    dto: CreateGoogleAdsBudgetDto,
  ) {
    const { customerId, accessToken } =
      await this.getTenantGoogleAdsContext(tenantId);

    const resourceName = await this.createBudget(
      customerId,
      accessToken,
      dto.name,
      dto.amountMicros,
      dto.deliveryMethod,
    );

    return {
      success: true,
      customerId,
      resourceName,
      name: dto.name,
      amountMicros: dto.amountMicros,
      deliveryMethod: dto.deliveryMethod ?? 'STANDARD',
    };
  }

  async createPerformanceMaxCampaign(
    tenantId: string,
    dto: CreateAdCampaignDto,
  ) {
    const { customerId, accessToken } =
      await this.getTenantGoogleAdsContext(tenantId);

    const budgetResourceName = await this.createBudget(
      customerId,
      accessToken,
      dto.name,
      dto.budgetDailyMicros,
    );

    const response = (await this.mutateGoogleAds({
      accessToken,
      customerId,
      mutateOperations: [
        {
          campaignOperation: {
            create: {
              name: dto.name,
              status: dto.status ?? AdCampaignStatusDto.PAUSED,
              advertisingChannelType: 'PERFORMANCE_MAX',
              campaignBudget: budgetResourceName,
              maximizeConversionValue: {},
            },
          },
        },
      ],
    })) as {
      mutateOperationResponses?: Array<{
        campaignResult?: { resourceName?: string };
      }>;
    };

    const resourceName =
      response.mutateOperationResponses?.[0]?.campaignResult?.resourceName;

    if (!resourceName) {
      throw new BadRequestException(
        'Google Ads performance max creation returned no resource name',
      );
    }

    const externalId = GoogleAdsMapper.extractId(resourceName);

    if (dto.targetCountry || dto.targetLanguage) {
      await this.addCampaignCriteria(tenantId, externalId, {
        countries: dto.targetCountry ? [dto.targetCountry] : undefined,
        languages: dto.targetLanguage ? [dto.targetLanguage] : undefined,
      });
    }

    const campaign = await this.persistCampaign(
      tenantId,
      externalId,
      dto.name,
      AdCampaignTypeDto.PERFORMANCE_MAX,
      dto.budgetDailyMicros,
      this.mapDtoStatusToEntityStatus(dto.status, AdCampaignStatus.ENABLED),
    );

    if (dto.audienceSegmentIds?.length) {
      await this.syncAudiencesToCampaign(
        tenantId,
        externalId,
        dto.audienceSegmentIds,
      );
    }

    return {
      ...campaign,
      budgetResourceName,
      resourceName: this.buildCampaignResourceName(customerId, externalId),
    };
  }

  async createAdGroup(tenantId: string, dto: CreateAdGroupDto) {
    const { customerId, accessToken } =
      await this.getTenantGoogleAdsContext(tenantId);

    const campaignResourceName = this.buildCampaignResourceName(
      customerId,
      dto.campaignExternalId,
    );

    const response = (await this.mutateGoogleAds({
      accessToken,
      customerId,
      mutateOperations: [
        {
          adGroupOperation: {
            create: {
              name: dto.name,
              campaign: campaignResourceName,
              status: 'ENABLED',
              cpcBidMicros: String(dto.cpcBidMicros ?? 1_000_000),
              type: 'SEARCH_STANDARD',
            },
          },
        },
      ],
    })) as {
      mutateOperationResponses?: Array<{
        adGroupResult?: { resourceName?: string };
      }>;
    };

    const adGroupResourceName =
      response.mutateOperationResponses?.[0]?.adGroupResult?.resourceName;

    if (!adGroupResourceName) {
      throw new BadRequestException(
        'Google Ads ad group creation returned no resource name',
      );
    }

    if (dto.keywords?.length) {
      await this.addKeywords(
        customerId,
        accessToken,
        adGroupResourceName,
        dto.keywords,
      );
    }

    if (dto.headline1 && dto.finalUrl) {
      await this.createResponsiveSearchAd(
        customerId,
        accessToken,
        adGroupResourceName,
        dto,
      );
    }

    return { adGroupResourceName };
  }

  async getBudgetRecommendations(tenantId: string) {
    const campaigns = await this.prisma.adCampaign.findMany({
      where: { tenantId, status: AdCampaignStatus.ENABLED },
    });

    return campaigns
      .filter((campaign) => campaign.roas !== null)
      .map((campaign) => {
        const roas = Number(campaign.roas ?? 0);
        const spend = Number(campaign.spend ?? 0);
        const currentBudget = Number(campaign.budgetDaily ?? 0);

        if (roas > 4) {
          return {
            campaignId: campaign.id,
            campaignName: campaign.name,
            currentBudget,
            roas,
            recommendation: 'increase' as const,
            suggestedBudget: currentBudget * 1.5,
            reason: `ROAS ${roas.toFixed(2)} is excellent. Increase budget by 50%.`,
          };
        }

        if (roas < 1 && spend > 50) {
          return {
            campaignId: campaign.id,
            campaignName: campaign.name,
            currentBudget,
            roas,
            recommendation: 'decrease' as const,
            suggestedBudget: currentBudget * 0.5,
            reason: `ROAS ${roas.toFixed(2)} is low. Reduce budget or pause campaign.`,
          };
        }

        return null;
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }

  async addCampaignCriteria(
    tenantId: string,
    externalId: string,
    criteria: {
      countries?: string[];
      languages?: string[];
    },
  ) {
    const { customerId, accessToken } =
      await this.getTenantGoogleAdsContext(tenantId);

    const campaignResourceName = this.buildCampaignResourceName(
      customerId,
      externalId,
    );

    const mutateOperations: unknown[] = [];

    for (const country of criteria.countries ?? []) {
      const geoTargetId = this.getGeoTargetId(country);

      if (!geoTargetId) {
        continue;
      }

      mutateOperations.push({
        campaignCriterionOperation: {
          create: {
            campaign: campaignResourceName,
            location: {
              geoTargetConstant: `geoTargetConstants/${geoTargetId}`,
            },
          },
        },
      });
    }

    for (const language of criteria.languages ?? []) {
      const languageId = this.getLanguageId(language);

      if (!languageId) {
        continue;
      }

      mutateOperations.push({
        campaignCriterionOperation: {
          create: {
            campaign: campaignResourceName,
            language: {
              languageConstant: `languageConstants/${languageId}`,
            },
          },
        },
      });
    }

    if (mutateOperations.length === 0) {
      return { criteriaAdded: 0 };
    }

    await this.mutateGoogleAds({
      accessToken,
      customerId,
      mutateOperations,
    });

    await this.prisma.adCampaign.updateMany({
      where: { tenantId, externalId },
      data: { syncedAt: new Date() },
    });

    return { criteriaAdded: mutateOperations.length };
  }

  private async createBudget(
    customerId: string,
    accessToken: string,
    name: string,
    amountMicros: number,
    deliveryMethod = 'STANDARD',
  ) {
    const response = (await this.mutateGoogleAds({
      accessToken,
      customerId,
      mutateOperations: [
        {
          campaignBudgetOperation: {
            create: {
              name,
              amountMicros: String(amountMicros),
              deliveryMethod,
              explicitlyShared: false,
            },
          },
        },
      ],
    })) as {
      mutateOperationResponses?: Array<{
        campaignBudgetResult?: { resourceName?: string };
      }>;
    };

    const resourceName =
      response.mutateOperationResponses?.[0]?.campaignBudgetResult
        ?.resourceName;

    if (!resourceName) {
      throw new BadRequestException(
        'Google Ads budget creation returned no resource name',
      );
    }

    return resourceName;
  }

  private async createGoogleCampaign(
    customerId: string,
    accessToken: string,
    dto: CreateAdCampaignDto,
    budgetResourceName: string,
  ) {
    const advertisingChannelType = this.mapTypeToChannel(dto.type);
    const status = dto.status ?? AdCampaignStatusDto.PAUSED;
    const createBody: Record<string, unknown> = {
      name: dto.name,
      status,
      advertisingChannelType,
      campaignBudget: budgetResourceName,
      targetSpend: {},
    };

    if (
      advertisingChannelType === 'SEARCH' ||
      advertisingChannelType === 'DISPLAY'
    ) {
      createBody.networkSettings = {
        targetGoogleSearch: true,
        targetSearchNetwork: true,
        targetContentNetwork: advertisingChannelType === 'DISPLAY',
        targetPartnerSearchNetwork: false,
      };
    }

    const response = (await this.mutateGoogleAds({
      accessToken,
      customerId,
      mutateOperations: [
        {
          campaignOperation: {
            create: createBody,
          },
        },
      ],
    })) as {
      mutateOperationResponses?: Array<{
        campaignResult?: { resourceName?: string };
      }>;
    };

    const resourceName =
      response.mutateOperationResponses?.[0]?.campaignResult?.resourceName;

    if (!resourceName) {
      throw new BadRequestException(
        'Google Ads campaign creation returned no resource name',
      );
    }

    return GoogleAdsMapper.extractId(resourceName);
  }

  private async addKeywords(
    customerId: string,
    accessToken: string,
    adGroupResourceName: string,
    keywords: string[],
  ) {
    const mutateOperations = keywords.map((keyword) => ({
      adGroupCriterionOperation: {
        create: {
          adGroup: adGroupResourceName,
          status: 'ENABLED',
          keyword: {
            text: keyword,
            matchType: 'BROAD',
          },
        },
      },
    }));

    await this.mutateGoogleAds({
      accessToken,
      customerId,
      mutateOperations,
    });
  }

  private async createResponsiveSearchAd(
    customerId: string,
    accessToken: string,
    adGroupResourceName: string,
    dto: CreateAdGroupDto,
  ) {
    const headlines = [
      dto.headline1,
      dto.headline2 ?? dto.headline1,
      dto.headline1 ? `Discover ${dto.headline1}` : undefined,
    ]
      .filter((value): value is string => Boolean(value))
      .map((text) => ({ text }));

    const descriptions = [
      dto.description ?? 'Discover our offer.',
      'See our latest offers today.',
    ].map((text) => ({ text }));

    await this.mutateGoogleAds({
      accessToken,
      customerId,
      mutateOperations: [
        {
          adGroupAdOperation: {
            create: {
              adGroup: adGroupResourceName,
              status: 'ENABLED',
              ad: {
                responsiveSearchAd: {
                  headlines,
                  descriptions,
                },
                finalUrls: dto.finalUrl ? [dto.finalUrl] : [],
              },
            },
          },
        },
      ],
    });
  }

  private async syncAudiencesToCampaign(
    tenantId: string,
    campaignExternalId: string,
    segmentIds: string[],
  ) {
    for (const segmentId of segmentIds) {
      const result = await this.syncAudienceFromSegment(
        tenantId,
        segmentId,
        `Audience Pilot - ${segmentId}`,
      );

      this.logger.log(
        `Audience ${result.audienceId} synchronized for campaign ${campaignExternalId}`,
      );
    }
  }

  private async getTenantGoogleAdsContext(tenantId: string) {
    const integration = await this.getActiveIntegration(tenantId);
    const credentials = this.getDecryptedCredentials(integration.credentials);
    const accessToken = await this.getAccessToken(credentials.refreshToken);

    return {
      customerId: credentials.customerId,
      accessToken,
    };
  }

  private async persistCampaign(
    tenantId: string,
    externalId: string,
    name: string,
    type: AdCampaignTypeDto,
    budgetDailyMicros: number,
    status: AdCampaignStatus = AdCampaignStatus.PAUSED,
  ) {
    return this.prisma.adCampaign.create({
      data: {
        tenantId,
        externalId,
        name,
        type: type as unknown as AdCampaignType,
        status,
        budgetDaily: new Prisma.Decimal(budgetDailyMicros / 1_000_000),
      },
    });
  }

  private mapTypeToChannel(type: AdCampaignTypeDto) {
    switch (type) {
      case AdCampaignTypeDto.SEARCH:
        return 'SEARCH';
      case AdCampaignTypeDto.SHOPPING:
        return 'SHOPPING';
      case AdCampaignTypeDto.PERFORMANCE_MAX:
        return 'PERFORMANCE_MAX';
      case AdCampaignTypeDto.DISPLAY:
        return 'DISPLAY';
      case AdCampaignTypeDto.VIDEO:
        return 'VIDEO';
      default:
        return 'SEARCH';
    }
  }

  private getGeoTargetId(countryCode: string) {
    const mapping: Record<string, number> = {
      FR: 2250,
      BE: 2056,
      CH: 2756,
      DE: 2276,
      ES: 2724,
      IT: 2380,
      GB: 2826,
      US: 2840,
      CA: 2124,
    };

    return mapping[countryCode.toUpperCase()] ?? null;
  }

  private getLanguageId(language: string) {
    const mapping: Record<string, number> = {
      en: 1000,
      de: 1001,
      fr: 1002,
      es: 1003,
      it: 1004,
      nl: 1010,
      pt: 1014,
    };

    return mapping[language.toLowerCase()] ?? null;
  }

  private mapDtoStatusToEntityStatus(
    status?: AdCampaignStatusDto,
    fallback: AdCampaignStatus = AdCampaignStatus.PAUSED,
  ) {
    switch (status) {
      case AdCampaignStatusDto.ENABLED:
        return AdCampaignStatus.ENABLED;
      case AdCampaignStatusDto.PAUSED:
        return AdCampaignStatus.PAUSED;
      default:
        return fallback;
    }
  }
}
