import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IntegrationStatus, IntegrationType, Prisma } from '@prisma/client';
import { EncryptionService } from '../../../common/services/encryption.service';
import { ClickhouseService } from '../../../database/clickhouse/clickhouse.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { ConnectGa4Dto } from './dto/connect-ga4.dto';
import { IngestEventDto } from './dto/ingest-event.dto';
import { SyncSessionsDto } from './dto/sync-sessions.dto';

type Ga4Credentials = {
  propertyId: string;
  measurementId?: string;
  apiSecret?: string;
};

@Injectable()
export class Ga4Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly clickhouseService: ClickhouseService,
  ) {}

  async connect(tenantId: string, dto: ConnectGa4Dto) {
    const connectedAt = new Date().toISOString();
    const encryptedCredentials = this.encryptionService.encryptJson({
      propertyId: dto.propertyId,
      measurementId: dto.measurementId,
      apiSecret: dto.apiSecret,
    });

    const integration = await this.prisma.integration.upsert({
      where: {
        tenantId_type: {
          tenantId,
          type: IntegrationType.GOOGLE_ANALYTICS,
        },
      },
      update: {
        status: IntegrationStatus.ACTIVE,
        credentials: encryptedCredentials,
        metadata: {
          provider: 'ga4',
          propertyId: dto.propertyId,
          measurementId: dto.measurementId ?? null,
          connectedAt,
        } as Prisma.JsonObject,
      },
      create: {
        tenantId,
        type: IntegrationType.GOOGLE_ANALYTICS,
        status: IntegrationStatus.ACTIVE,
        credentials: encryptedCredentials,
        metadata: {
          provider: 'ga4',
          propertyId: dto.propertyId,
          measurementId: dto.measurementId ?? null,
          connectedAt,
        } as Prisma.JsonObject,
      },
    });

    return {
      success: true,
      integrationId: integration.id,
      status: integration.status,
      provider: 'ga4',
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
          provider: 'ga4',
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

  async getStatus(tenantId: string) {
    const integration = await this.prisma.integration.findUnique({
      where: {
        tenantId_type: {
          tenantId,
          type: IntegrationType.GOOGLE_ANALYTICS,
        },
      },
    });

    if (!integration) {
      return {
        connected: false,
        status: IntegrationStatus.DISCONNECTED,
        provider: 'ga4',
      };
    }

    const credentials = integration.credentials
      ? this.encryptionService.decryptJson<Ga4Credentials>(
          integration.credentials,
        )
      : null;

    return {
      connected: integration.status === IntegrationStatus.ACTIVE,
      status: integration.status,
      provider: 'ga4',
      propertyId: credentials?.propertyId ?? null,
      measurementId: credentials?.measurementId ?? null,
      lastSyncAt: integration.lastSyncAt,
    };
  }

  async ingestEvent(tenantId: string, dto: IngestEventDto) {
    await this.getActiveIntegration(tenantId);

    const date = this.normalizeDate(dto.occurredAt);
    const sessions =
      dto.sessionCount ?? (dto.eventName === 'session_start' ? 1 : 0);
    const newContacts =
      dto.newContacts ??
      (dto.eventName === 'sign_up' || dto.eventName === 'generate_lead'
        ? 1
        : 0);

    await this.insertMetricsRow({
      tenantId,
      date,
      revenue: dto.revenue ?? 0,
      orders: dto.orders ?? 0,
      sessions,
      newContacts,
    });

    return {
      success: true,
      tenantId,
      received: true,
      eventName: dto.eventName,
      aggregated: {
        date,
        sessions,
        newContacts,
        revenue: dto.revenue ?? 0,
        orders: dto.orders ?? 0,
      },
    };
  }

  async syncSessions(tenantId: string, dto: SyncSessionsDto) {
    const integration = await this.getActiveIntegration(tenantId);
    const date = this.normalizeDate(dto.date);

    await this.insertMetricsRow({
      tenantId,
      date,
      revenue: dto.revenue ?? 0,
      orders: dto.orders ?? 0,
      sessions: dto.sessions,
      newContacts: dto.newContacts ?? 0,
    });

    await this.prisma.integration.update({
      where: { id: integration.id },
      data: {
        lastSyncAt: new Date(),
      },
    });

    return {
      success: true,
      date,
      sessions: dto.sessions,
      newContacts: dto.newContacts ?? 0,
    };
  }

  private async getIntegration(tenantId: string) {
    const integration = await this.prisma.integration.findUnique({
      where: {
        tenantId_type: {
          tenantId,
          type: IntegrationType.GOOGLE_ANALYTICS,
        },
      },
    });

    if (!integration) {
      throw new NotFoundException('GA4 integration not found');
    }

    return integration;
  }

  private async getActiveIntegration(tenantId: string) {
    const integration = await this.getIntegration(tenantId);

    if (integration.status !== IntegrationStatus.ACTIVE) {
      throw new BadRequestException('GA4 integration is not active');
    }

    return integration;
  }

  private normalizeDate(value?: string) {
    const date = value ? new Date(value) : new Date();

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date');
    }

    return date.toISOString().slice(0, 10);
  }

  private async insertMetricsRow(params: {
    tenantId: string;
    date: string;
    revenue: number;
    orders: number;
    sessions: number;
    newContacts: number;
  }) {
    await this.clickhouseService.insert('metrics_daily', [
      {
        tenant_id: params.tenantId,
        date: params.date,
        revenue: params.revenue,
        orders: params.orders,
        email_revenue: 0,
        ads_spend: 0,
        sessions: params.sessions,
        new_contacts: params.newContacts,
      },
    ]);
  }
}
