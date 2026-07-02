import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { EncryptionService } from '../../../common/services/encryption.service';
import { ClickhouseService } from '../../../database/clickhouse/clickhouse.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { SyncQueueService } from '../../../queue/services/sync-queue.service';
import { GoogleAdsService } from './google-ads.service';

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
    updateMany: jest.fn(),
  },
  googleAdsConnection: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
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

  it('upserts Google Ads connection from OAuth callback with encrypted refreshToken credentials', async () => {
    let capturedCreateArgs: Prisma.GoogleAdsConnectionCreateArgs | undefined;

    prismaMock.googleAdsConnection.findFirst.mockResolvedValue(null);
    prismaMock.googleAdsConnection.create.mockImplementation(
      (args: Prisma.GoogleAdsConnectionCreateArgs) => {
        capturedCreateArgs = args;

        return Promise.resolve({
          id: 'connection-1',
          tenantId: args.data.tenantId,
          customerId: args.data.customerId || 'A_DEMANDER_APRES',
          refreshTokenEncrypted: args.data.refreshTokenEncrypted,
          accessTokenEncrypted: args.data.accessTokenEncrypted ?? null,
          expiresAt: args.data.expiresAt ? new Date(args.data.expiresAt) : null,
          connectedAt: new Date(),
          updatedAt: new Date(),
          userId: null,
          loginCustomerId: null,
        });
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

    expect(prismaMock.googleAdsConnection.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
      orderBy: { connectedAt: 'desc' },
    });
    expect(capturedCreateArgs).toBeDefined();

    const createdData = capturedCreateArgs!.data;
    expect(createdData.refreshTokenEncrypted).toBeDefined();
    expect(encryptionService.decrypt(createdData.refreshTokenEncrypted)).toBe(
      'refresh-token-from-oauth',
    );
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        tenantId: 'tenant-1',
        integrationId: 'connection-1',
      }),
    );
  });

  it('connectCustomer adds customerId on the existing OAuth connection', async () => {
    let capturedUpdateArgs: Prisma.GoogleAdsConnectionUpdateArgs | undefined;
    const existingConnection = {
      id: 'connection-1',
      tenantId: 'tenant-1',
      customerId: 'A_DEMANDER_APRES',
      refreshTokenEncrypted: encryptionService.encrypt(
        'refresh-token-from-oauth',
      ),
      accessTokenEncrypted: encryptionService.encrypt('access-token'),
      expiresAt: new Date(),
      connectedAt: new Date(),
      updatedAt: new Date(),
      userId: null,
      loginCustomerId: null,
    };

    prismaMock.googleAdsConnection.findFirst.mockResolvedValue(
      existingConnection,
    );
    prismaMock.googleAdsConnection.update.mockImplementation(
      (args: Prisma.GoogleAdsConnectionUpdateArgs) => {
        capturedUpdateArgs = args;

        return Promise.resolve({
          ...existingConnection,
          customerId: args.data.customerId as string,
        });
      },
    );

    const result = await service.connectCustomer('tenant-1', '123-456-7890');

    expect(prismaMock.googleAdsConnection.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
      orderBy: { connectedAt: 'desc' },
    });
    expect(prismaMock.googleAdsConnection.update).toHaveBeenCalled();
    expect(capturedUpdateArgs).toBeDefined();

    expect(capturedUpdateArgs!.where).toEqual({ id: 'connection-1' });
    expect(capturedUpdateArgs!.data).toEqual({ customerId: '1234567890' });
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        integrationId: 'connection-1',
        customerId: '1234567890',
        status: 'ACTIVE',
      }),
    );
  });

  it('connectCustomer refuses to set customerId before OAuth callback', async () => {
    prismaMock.googleAdsConnection.findFirst.mockResolvedValue(null);

    await expect(
      service.connectCustomer('tenant-1', '1234567890'),
    ).rejects.toThrow(NotFoundException);
    expect(prismaMock.googleAdsConnection.update).not.toHaveBeenCalled();
  });

  it('disconnects Google Ads connection and deletes it from database', async () => {
    const existingConnection = {
      id: 'connection-1',
      tenantId: 'tenant-1',
      customerId: '1234567890',
      refreshTokenEncrypted: encryptionService.encrypt(
        'refresh-token-from-oauth',
      ),
      accessTokenEncrypted: null,
      expiresAt: null,
      connectedAt: new Date(),
      updatedAt: new Date(),
      userId: null,
      loginCustomerId: null,
    };

    prismaMock.googleAdsConnection.findFirst.mockResolvedValue(
      existingConnection,
    );
    prismaMock.googleAdsConnection.delete.mockResolvedValue(existingConnection);

    const result = await service.disconnect('tenant-1');

    expect(prismaMock.googleAdsConnection.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
      orderBy: { connectedAt: 'desc' },
    });
    expect(prismaMock.googleAdsConnection.delete).toHaveBeenCalledWith({
      where: { id: 'connection-1' },
    });
    expect(result).toEqual({
      success: true,
      integrationId: 'connection-1',
      status: 'DISCONNECTED',
    });
  });
});
