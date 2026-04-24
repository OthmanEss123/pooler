import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { IntegrationStatus, IntegrationType, Prisma } from '@prisma/client';
import { EncryptionService } from '../../../common/services/encryption.service';
import { ClickhouseService } from '../../../database/clickhouse/clickhouse.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { SyncQueueService } from '../../../queue/services/sync-queue.service';
import { GoogleAdsService } from './google-ads.service';

type GoogleAdsCredentials = {
  refreshToken: string;
  customerId?: string;
};

type GoogleAdsIntegrationUpsertArgs = {
  create: {
    credentials: string;
    status: IntegrationStatus;
  };
  update: {
    credentials: string;
    status: IntegrationStatus;
  };
};

type GoogleAdsIntegrationUpdateArgs = {
  where: { id: string };
  data: { credentials: string; metadata: Prisma.JsonObject };
};

const encryptionKey =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const configMock = {
  get: jest.fn((key: string, defaultValue?: string) => {
    const values: Record<string, string> = {
      ENCRYPTION_KEY: encryptionKey,
      GOOGLE_CLIENT_ID: 'client-id',
      GOOGLE_CLIENT_SECRET: 'client-secret',
      GOOGLE_ADS_REDIRECT_URI: 'https://app.test/oauth/google-ads/callback',
      GOOGLE_ADS_API_VERSION: 'v22',
    };

    return values[key] ?? defaultValue;
  }),
};

const prismaMock = {
  integration: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
};

const syncQueueMock = {
  syncGoogleAds: jest.fn(),
};

const clickhouseMock = {
  insert: jest.fn(),
};

describe('GoogleAdsService', () => {
  let service: GoogleAdsService;
  let encryptionService: EncryptionService;
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleAdsService,
        EncryptionService,
        { provide: ConfigService, useValue: configMock },
        { provide: PrismaService, useValue: prismaMock },
        { provide: SyncQueueService, useValue: syncQueueMock },
        { provide: ClickhouseService, useValue: clickhouseMock },
      ],
    }).compile();

    service = module.get<GoogleAdsService>(GoogleAdsService);
    encryptionService = module.get<EncryptionService>(EncryptionService);
    fetchMock = jest.fn();
    global.fetch = fetchMock;

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('upserts Google Ads integration from OAuth callback with encrypted refreshToken credentials', async () => {
    let capturedUpsertArgs: GoogleAdsIntegrationUpsertArgs | undefined;

    prismaMock.integration.findUnique.mockResolvedValue(null);
    prismaMock.integration.upsert.mockImplementation(
      (args: GoogleAdsIntegrationUpsertArgs) => {
        capturedUpsertArgs = args;

        return {
          id: 'integration-1',
          ...args.create,
        };
      },
    );
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: 'access-token',
          expires_in: 3600,
          refresh_token: 'refresh-token-from-oauth',
          scope: 'https://www.googleapis.com/auth/adwords',
          token_type: 'Bearer',
        }),
    });

    const result = await service.handleOAuthCallback('tenant-1', 'oauth-code');

    expect(prismaMock.integration.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_type: {
            tenantId: 'tenant-1',
            type: IntegrationType.GOOGLE_ADS,
          },
        },
      }),
    );
    expect(capturedUpsertArgs).toBeDefined();

    const upsertArgs = capturedUpsertArgs as GoogleAdsIntegrationUpsertArgs;

    expect(upsertArgs.create.status).toBe(IntegrationStatus.ACTIVE);
    expect(upsertArgs.update.status).toBe(IntegrationStatus.ACTIVE);
    expect(upsertArgs.create.credentials).not.toContain(
      'refresh-token-from-oauth',
    );

    const credentials = encryptionService.decryptJson<GoogleAdsCredentials>(
      upsertArgs.create.credentials,
    );

    expect(credentials).toEqual({
      refreshToken: 'refresh-token-from-oauth',
    });
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        tenantId: 'tenant-1',
        integrationId: 'integration-1',
      }),
    );
  });

  it('connectCustomer adds customerId on the existing OAuth integration credentials', async () => {
    let capturedUpdateArgs: GoogleAdsIntegrationUpdateArgs | undefined;
    const existingCredentials = encryptionService.encryptJson({
      refreshToken: 'refresh-token-from-oauth',
    });
    const existingIntegration = {
      id: 'integration-1',
      tenantId: 'tenant-1',
      type: IntegrationType.GOOGLE_ADS,
      status: IntegrationStatus.ACTIVE,
      credentials: existingCredentials,
      metadata: {
        provider: 'google-ads',
        connectedAt: '2026-04-24T08:00:00.000Z',
      } satisfies Prisma.JsonObject,
      lastSyncAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    prismaMock.integration.findUnique.mockResolvedValue(existingIntegration);
    prismaMock.integration.update.mockImplementation(
      (args: GoogleAdsIntegrationUpdateArgs) => {
        capturedUpdateArgs = args;

        return {
          ...existingIntegration,
          ...args.data,
        };
      },
    );

    const result = await service.connectCustomer('tenant-1', '123-456-7890');

    expect(prismaMock.integration.findUnique).toHaveBeenCalledWith({
      where: {
        tenantId_type: {
          tenantId: 'tenant-1',
          type: IntegrationType.GOOGLE_ADS,
        },
      },
    });
    expect(prismaMock.integration.create).not.toHaveBeenCalled();
    expect(capturedUpdateArgs).toBeDefined();

    const updateArgs = capturedUpdateArgs as GoogleAdsIntegrationUpdateArgs;
    const credentials = encryptionService.decryptJson<GoogleAdsCredentials>(
      updateArgs.data.credentials,
    );

    expect(updateArgs.where).toEqual({ id: 'integration-1' });
    expect(credentials).toEqual({
      refreshToken: 'refresh-token-from-oauth',
      customerId: '1234567890',
    });
    expect(updateArgs.data.metadata).toEqual(
      expect.objectContaining({
        customerId: '1234567890',
        connectedAt: '2026-04-24T08:00:00.000Z',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        integrationId: 'integration-1',
        customerId: '1234567890',
        status: IntegrationStatus.ACTIVE,
      }),
    );
  });

  it('connectCustomer refuses to create a Google Ads integration before OAuth callback', async () => {
    prismaMock.integration.findUnique.mockResolvedValue(null);

    await expect(
      service.connectCustomer('tenant-1', '1234567890'),
    ).rejects.toThrow(NotFoundException);
    expect(prismaMock.integration.create).not.toHaveBeenCalled();
    expect(prismaMock.integration.update).not.toHaveBeenCalled();
  });

  it('connectCustomer refuses an existing integration without OAuth credentials', async () => {
    prismaMock.integration.findUnique.mockResolvedValue({
      id: 'integration-1',
      tenantId: 'tenant-1',
      type: IntegrationType.GOOGLE_ADS,
      status: IntegrationStatus.ACTIVE,
      credentials: null,
      metadata: null,
      lastSyncAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      service.connectCustomer('tenant-1', '1234567890'),
    ).rejects.toThrow(BadRequestException);
    expect(prismaMock.integration.update).not.toHaveBeenCalled();
  });
});
