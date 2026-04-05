/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await, @typescript-eslint/no-unnecessary-type-assertion */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeyScope, CampaignStatus, CampaignType } from '@prisma/client';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ClickhouseService } from '../src/database/clickhouse/clickhouse.service';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { createPrismaMock, toCookieHeader } from './support/create-prisma-mock';

process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??=
  'postgresql://user:password@localhost:5432/pilot_platform';
process.env.DIRECT_URL ??=
  'postgresql://user:password@localhost:5432/pilot_platform';
process.env.CLICKHOUSE_URL ??= 'http://default:password@localhost:8123/pilot';
process.env.JWT_SECRET ??=
  '1234567890123456789012345678901234567890123456789012345678901234';
process.env.JWT_EXPIRES_IN ??= '15m';

interface MockCampaign {
  id: string;
  tenantId: string;
  name: string;
  subject: string;
  previewText: string | null;
  fromName: string;
  fromEmail: string;
  replyTo: string | null;
  htmlContent: string;
  textContent: string | null;
  status: CampaignStatus;
  type: CampaignType;
  scheduledAt: Date | null;
  sentAt: Date | null;
  segmentId: string;
  totalSent: number;
  totalDelivered: number;
  totalOpened: number;
  totalClicked: number;
  totalBounced: number;
  totalUnsubscribed: number;
  totalComplained: number;
  revenue: number;
  createdAt: Date;
  updatedAt: Date;
}

interface MockAbTest {
  id: string;
  campaignId: string;
  variantName: string;
  subject: string;
  htmlContent: string;
  splitPercent: number;
  isWinner: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface MockEmailEvent {
  id: string;
  tenantId: string;
  campaignId: string;
  contactId: string;
  type: string;
  provider: string | null;
  providerId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

const extendPrismaMock = () => {
  const prismaMock = createPrismaMock() as Record<string, any>;
  const originalContactFindMany = prismaMock.contact.findMany.bind(
    prismaMock.contact,
  ) as (args?: {
    where?: Record<string, unknown>;
    select?: Record<string, unknown>;
  }) => Promise<Array<Record<string, unknown>>>;

  const contactOverrides = new Map<string, Record<string, unknown>>();
  const campaigns: MockCampaign[] = [];
  const abTests: MockAbTest[] = [];
  const emailEvents: MockEmailEvent[] = [];

  let campaignCounter = 1;
  let abTestCounter = 1;
  let emailEventCounter = 1;

  const findContact = async (where: {
    id?: string;
    tenantId?: string;
  }): Promise<Record<string, unknown> | null> => {
    const contacts = await originalContactFindMany({ where });
    const contact = contacts[0] ?? null;

    if (!contact) {
      return null;
    }

    const overrides = contactOverrides.get(String(contact.id)) ?? {};
    return {
      ...contact,
      ...overrides,
    };
  };

  const includeCampaignRelations = async (
    campaign: MockCampaign,
    include?: { segment?: boolean; abTests?: boolean },
  ) => {
    const result: Record<string, unknown> = { ...campaign };

    if (include?.segment) {
      result.segment = await prismaMock.segment.findFirst({
        where: {
          id: campaign.segmentId,
          tenantId: campaign.tenantId,
        },
      });
    }

    if (include?.abTests) {
      result.abTests = abTests.filter(
        (candidate) => candidate.campaignId === campaign.id,
      );
    }

    return result;
  };

  prismaMock.contact.findFirst = jest.fn(
    async ({ where }: { where: { id?: string; tenantId?: string } }) => {
      return findContact(where ?? {});
    },
  );

  prismaMock.contact.update = jest.fn(
    async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => {
      const existing = await findContact({ id: where.id });

      if (!existing) {
        throw new Error('Contact not found');
      }

      const updated = {
        ...existing,
        ...data,
        updatedAt: new Date(),
      };

      contactOverrides.set(where.id, updated);
      return updated;
    },
  );

  prismaMock.campaign = {
    create: jest.fn(
      async ({
        data,
        include,
      }: {
        data: Record<string, unknown>;
        include?: { segment?: boolean; abTests?: boolean };
      }) => {
        const now = new Date();
        const campaign: MockCampaign = {
          id: `campaign-${campaignCounter++}`,
          tenantId: String(data.tenantId),
          name: String(data.name),
          subject: String(data.subject),
          previewText: (data.previewText as string | undefined) ?? null,
          fromName: String(data.fromName),
          fromEmail: String(data.fromEmail),
          replyTo: (data.replyTo as string | undefined) ?? null,
          htmlContent: String(data.htmlContent),
          textContent: (data.textContent as string | undefined) ?? null,
          status:
            (data.status as CampaignStatus | undefined) ?? CampaignStatus.DRAFT,
          type: (data.type as CampaignType | undefined) ?? CampaignType.REGULAR,
          scheduledAt: (data.scheduledAt as Date | null | undefined) ?? null,
          sentAt: (data.sentAt as Date | null | undefined) ?? null,
          segmentId: String(data.segmentId),
          totalSent: 0,
          totalDelivered: 0,
          totalOpened: 0,
          totalClicked: 0,
          totalBounced: 0,
          totalUnsubscribed: 0,
          totalComplained: 0,
          revenue: 0,
          createdAt: now,
          updatedAt: now,
        };

        campaigns.push(campaign);
        return includeCampaignRelations(campaign, include);
      },
    ),
    findMany: jest.fn(
      async ({
        where,
        include,
        orderBy,
      }: {
        where?: { tenantId?: string; status?: CampaignStatus };
        include?: { segment?: boolean; abTests?: boolean };
        orderBy?: { createdAt?: 'asc' | 'desc' };
      }) => {
        const filtered = campaigns.filter((candidate) => {
          if (where?.tenantId && candidate.tenantId !== where.tenantId) {
            return false;
          }

          if (where?.status && candidate.status !== where.status) {
            return false;
          }

          return true;
        });

        filtered.sort((left, right) =>
          orderBy?.createdAt === 'asc'
            ? left.createdAt.getTime() - right.createdAt.getTime()
            : right.createdAt.getTime() - left.createdAt.getTime(),
        );

        return Promise.all(
          filtered.map((campaign) =>
            includeCampaignRelations(campaign, include),
          ),
        );
      },
    ),
    findFirst: jest.fn(
      async ({
        where,
        include,
      }: {
        where?: { id?: string; tenantId?: string };
        include?: { segment?: boolean; abTests?: boolean };
      }) => {
        const campaign =
          campaigns.find((candidate) => {
            if (where?.id && candidate.id !== where.id) {
              return false;
            }

            if (where?.tenantId && candidate.tenantId !== where.tenantId) {
              return false;
            }

            return true;
          }) ?? null;

        if (!campaign) {
          return null;
        }

        return includeCampaignRelations(campaign, include);
      },
    ),
    update: jest.fn(
      async ({
        where,
        data,
        include,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
        include?: { segment?: boolean; abTests?: boolean };
      }) => {
        const campaign = campaigns.find(
          (candidate) => candidate.id === where.id,
        );

        if (!campaign) {
          throw new Error('Campaign not found');
        }

        for (const [key, value] of Object.entries(data)) {
          if (
            typeof value === 'object' &&
            value !== null &&
            'increment' in value &&
            typeof value.increment === 'number'
          ) {
            campaign[key as keyof MockCampaign] = (((campaign[
              key as keyof MockCampaign
            ] as number | undefined) ?? 0) + value.increment) as never;
            continue;
          }

          campaign[key as keyof MockCampaign] = value as never;
        }

        campaign.updatedAt = new Date();
        return includeCampaignRelations(campaign, include);
      },
    ),
    delete: jest.fn(async ({ where }: { where: { id: string } }) => {
      const index = campaigns.findIndex(
        (candidate) => candidate.id === where.id,
      );

      if (index === -1) {
        throw new Error('Campaign not found');
      }

      const [campaign] = campaigns.splice(index, 1);

      for (
        let currentIndex = abTests.length - 1;
        currentIndex >= 0;
        currentIndex -= 1
      ) {
        if (abTests[currentIndex].campaignId === campaign.id) {
          abTests.splice(currentIndex, 1);
        }
      }

      for (
        let currentIndex = emailEvents.length - 1;
        currentIndex >= 0;
        currentIndex -= 1
      ) {
        if (emailEvents[currentIndex].campaignId === campaign.id) {
          emailEvents.splice(currentIndex, 1);
        }
      }

      return campaign;
    }),
  };

  prismaMock.abTest = {
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const now = new Date();
      const variant: MockAbTest = {
        id: `ab-test-${abTestCounter++}`,
        campaignId: String(data.campaignId),
        variantName: String(data.variantName),
        subject: String(data.subject),
        htmlContent: String(data.htmlContent),
        splitPercent: Number(data.splitPercent),
        isWinner: false,
        createdAt: now,
        updatedAt: now,
      };

      abTests.push(variant);
      return variant;
    }),
    findFirst: jest.fn(
      async ({ where }: { where?: { id?: string; campaignId?: string } }) => {
        return (
          abTests.find((candidate) => {
            if (where?.id && candidate.id !== where.id) {
              return false;
            }

            if (
              where?.campaignId &&
              candidate.campaignId !== where.campaignId
            ) {
              return false;
            }

            return true;
          }) ?? null
        );
      },
    ),
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
      return abTests.find((candidate) => candidate.id === where.id) ?? null;
    }),
    updateMany: jest.fn(
      async ({
        where,
        data,
      }: {
        where?: { campaignId?: string };
        data: Partial<MockAbTest>;
      }) => {
        let count = 0;

        for (const variant of abTests) {
          if (where?.campaignId && variant.campaignId !== where.campaignId) {
            continue;
          }

          Object.assign(variant, data, { updatedAt: new Date() });
          count += 1;
        }

        return { count };
      },
    ),
    update: jest.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<MockAbTest>;
      }) => {
        const variant = abTests.find((candidate) => candidate.id === where.id);

        if (!variant) {
          throw new Error('Variant not found');
        }

        Object.assign(variant, data, { updatedAt: new Date() });
        return variant;
      },
    ),
  };

  prismaMock.emailEvent = {
    count: jest.fn(
      async ({
        where,
      }: {
        where?: {
          tenantId?: string;
          type?: string;
          createdAt?: { gte?: Date };
        };
      } = {}) => {
        return emailEvents.filter((candidate) => {
          if (where?.tenantId && candidate.tenantId !== where.tenantId) {
            return false;
          }

          if (where?.type && candidate.type !== where.type) {
            return false;
          }

          if (
            where?.createdAt?.gte &&
            candidate.createdAt < where.createdAt.gte
          ) {
            return false;
          }

          return true;
        }).length;
      },
    ),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const emailEvent: MockEmailEvent = {
        id: `email-event-${emailEventCounter++}`,
        tenantId: String(data.tenantId),
        campaignId: String(data.campaignId),
        contactId: String(data.contactId),
        type: String(data.type),
        provider: (data.provider as string | undefined) ?? null,
        providerId: (data.providerId as string | undefined) ?? null,
        metadata:
          (data.metadata as Record<string, unknown> | undefined) ?? null,
        createdAt: new Date(),
      };

      emailEvents.push(emailEvent);
      return emailEvent;
    }),
    findFirst: jest.fn(
      async ({
        where,
      }: {
        where?: {
          tenantId?: string;
          contactId?: string;
          campaignId?: string;
          type?: string;
        };
      }) => {
        return (
          emailEvents.find((candidate) => {
            if (where?.tenantId && candidate.tenantId !== where.tenantId) {
              return false;
            }

            if (where?.contactId && candidate.contactId !== where.contactId) {
              return false;
            }

            if (
              where?.campaignId &&
              candidate.campaignId !== where.campaignId
            ) {
              return false;
            }

            if (where?.type && candidate.type !== where.type) {
              return false;
            }

            return true;
          }) ?? null
        );
      },
    ),
    findMany: jest.fn(
      async ({
        where,
        orderBy,
        include,
      }: {
        where?: { tenantId?: string; contactId?: string; campaignId?: string };
        orderBy?: { createdAt?: 'asc' | 'desc' };
        include?: { contact?: boolean };
      }) => {
        const filtered = emailEvents.filter((candidate) => {
          if (where?.tenantId && candidate.tenantId !== where.tenantId) {
            return false;
          }

          if (where?.contactId && candidate.contactId !== where.contactId) {
            return false;
          }

          if (where?.campaignId && candidate.campaignId !== where.campaignId) {
            return false;
          }

          return true;
        });

        filtered.sort((left, right) =>
          orderBy?.createdAt === 'asc'
            ? left.createdAt.getTime() - right.createdAt.getTime()
            : right.createdAt.getTime() - left.createdAt.getTime(),
        );

        if (!include?.contact) {
          return filtered;
        }

        return Promise.all(
          filtered.map(async (emailEvent) => ({
            ...emailEvent,
            contact: await findContact({
              id: emailEvent.contactId,
              tenantId: emailEvent.tenantId,
            }),
          })),
        );
      },
    ),
  };

  prismaMock.$transaction = async <T>(
    input: Promise<unknown>[] | ((tx: typeof prismaMock) => Promise<T>),
  ): Promise<T | unknown[]> => {
    if (Array.isArray(input)) {
      return Promise.all(input);
    }

    return input(prismaMock);
  };

  return prismaMock;
};

describe('Campaigns and Email Events (e2e)', () => {
  let app: INestApplication<Server>;
  let ownerCookies: string[] = [];
  let readOnlyApiKey = '';
  let segmentId = '';
  let contactId = '';
  let campaignId = '';
  let variantId = '';
  let sendingCampaignId = '';

  const prismaMock = extendPrismaMock();

  const owner = {
    tenantName: 'Campaign Corp',
    tenantSlug: 'campaign-corp',
    email: 'campaign-owner@example.com',
    password: 'Password123!',
  };

  const createCampaignPayload = (name: string) => ({
    name,
    subject: 'Welcome to Pilot',
    previewText: 'Preview text',
    fromName: 'Pilot',
    fromEmail: 'hello@pilot.com',
    replyTo: 'support@pilot.com',
    htmlContent: '<h1>Hello</h1>',
    textContent: 'Hello',
    segmentId,
    type: 'REGULAR',
  });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(ClickhouseService)
      .useValue({
        isHealthy: jest.fn().mockResolvedValue(true),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );

    await app.init();

    const registerResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(owner)
      .expect(201);

    ownerCookies = toCookieHeader(
      registerResponse.headers['set-cookie'] as unknown as string[],
    );

    const apiKeyResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/api-keys')
      .set('Cookie', ownerCookies)
      .send({ name: 'Campaigns Read Only', scope: ApiKeyScope.READ_ONLY })
      .expect(201);

    readOnlyApiKey = apiKeyResponse.body.key as string;

    const segmentResponse = await request(app.getHttpServer())
      .post('/api/v1/segments')
      .set('Cookie', ownerCookies)
      .send({
        name: 'Subscribed Contacts',
        type: 'DYNAMIC',
        conditions: {
          operator: 'AND',
          rules: [
            { field: 'emailStatus', operator: 'eq', value: 'SUBSCRIBED' },
          ],
        },
      })
      .expect(201);

    segmentId = segmentResponse.body.id as string;

    await request(app.getHttpServer())
      .post(`/api/v1/segments/${segmentId}/sync`)
      .set('Cookie', ownerCookies)
      .expect(200);

    const membersResponse = await request(app.getHttpServer())
      .get(`/api/v1/segments/${segmentId}/members`)
      .set('Cookie', ownerCookies)
      .expect(200);

    contactId = membersResponse.body.data[0].id as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /campaigns -> 201', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/campaigns')
      .set('Cookie', ownerCookies)
      .send(createCampaignPayload('Lifecycle Campaign'))
      .expect(201);

    expect(response.body.name).toBe('Lifecycle Campaign');
    expect(response.body.status).toBe(CampaignStatus.DRAFT);
    expect(response.body.segment.id).toBe(segmentId);
    campaignId = response.body.id as string;
  });

  it('GET /campaigns -> 200 for owner', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/campaigns')
      .set('Cookie', ownerCookies)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body[0].id).toBe(campaignId);
  });

  it('GET /campaigns -> 200 for read-only API key', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/campaigns')
      .set('x-api-key', readOnlyApiKey)
      .expect(200);
  });

  it('GET /campaigns/:id -> 200', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/campaigns/${campaignId}`)
      .set('Cookie', ownerCookies)
      .expect(200);

    expect(response.body.id).toBe(campaignId);
    expect(response.body.abTests).toEqual([]);
  });

  it('PATCH /campaigns/:id -> 200', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/campaigns/${campaignId}`)
      .set('Cookie', ownerCookies)
      .send({ name: 'Lifecycle Campaign Updated' })
      .expect(200);

    expect(response.body.name).toBe('Lifecycle Campaign Updated');
  });

  it('GET /campaigns/:id/stats -> 200 with zeroed stats initially', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/campaigns/${campaignId}/stats`)
      .set('Cookie', ownerCookies)
      .expect(200);

    expect(response.body).toMatchObject({
      campaignId,
      totalSent: 0,
      totalDelivered: 0,
      totalOpened: 0,
    });
  });

  it('POST /campaigns/:id/ab-tests -> 201', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/campaigns/${campaignId}/ab-tests`)
      .set('Cookie', ownerCookies)
      .send({
        variantName: 'Variant B',
        subject: 'Welcome B',
        htmlContent: '<h1>Hello B</h1>',
        splitPercent: 50,
      })
      .expect(201);

    expect(response.body.variantName).toBe('Variant B');
    variantId = response.body.id as string;
  });

  it('POST /campaigns/:id/ab-tests/:variantId/winner -> 200', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/campaigns/${campaignId}/ab-tests/${variantId}/winner`)
      .set('Cookie', ownerCookies)
      .expect(200);

    expect(response.body.id).toBe(variantId);
    expect(response.body.isWinner).toBe(true);
  });

  it('POST /campaigns/:id/schedule -> 200', async () => {
    const scheduledAt = new Date(Date.now() + 3_600_000).toISOString();
    const response = await request(app.getHttpServer())
      .post(`/api/v1/campaigns/${campaignId}/schedule`)
      .set('Cookie', ownerCookies)
      .send({ scheduledAt })
      .expect(200);

    expect(response.body.status).toBe(CampaignStatus.SCHEDULED);
    expect(response.body.scheduledAt).toBe(scheduledAt);
  });

  it('POST /campaigns/:id/pause -> 200', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/campaigns/${campaignId}/pause`)
      .set('Cookie', ownerCookies)
      .expect(200);

    expect(response.body.status).toBe(CampaignStatus.PAUSED);
  });

  it('POST /campaigns/:id/cancel -> 200', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/campaigns/${campaignId}/cancel`)
      .set('Cookie', ownerCookies)
      .expect(200);

    expect(response.body.status).toBe(CampaignStatus.CANCELLED);
  });

  it('DELETE /campaigns/:id -> 204', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/campaigns/${campaignId}`)
      .set('Cookie', ownerCookies)
      .expect(204);
  });

  it('POST /campaigns/:id/send -> 200 on a fresh campaign', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/api/v1/campaigns')
      .set('Cookie', ownerCookies)
      .send(createCampaignPayload('Send Campaign'))
      .expect(201);

    sendingCampaignId = createResponse.body.id as string;

    const response = await request(app.getHttpServer())
      .post(`/api/v1/campaigns/${sendingCampaignId}/send`)
      .set('Cookie', ownerCookies)
      .expect(200);

    expect(response.body).toMatchObject({
      campaignId: sendingCampaignId,
      status: CampaignStatus.SENDING,
    });
  });

  it('POST /email-events/webhook -> 200 for SENT/DELIVERED/OPENED', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/email-events/webhook')
      .send({
        campaignId: sendingCampaignId,
        contactId,
        type: 'SENT',
        provider: 'resend',
        providerId: 'evt-1',
        metadata: { source: 'e2e' },
      })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/email-events/webhook')
      .send({
        campaignId: sendingCampaignId,
        contactId,
        type: 'DELIVERED',
        provider: 'resend',
        providerId: 'evt-2',
      })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/email-events/webhook')
      .send({
        campaignId: sendingCampaignId,
        contactId,
        type: 'OPENED',
        provider: 'resend',
        providerId: 'evt-3',
      })
      .expect(200);
  });

  it('GET /email-events/contact/:contactId -> 200', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/email-events/contact/${contactId}`)
      .set('Cookie', ownerCookies)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toHaveLength(3);
  });

  it('GET /email-events/campaign/:campaignId -> 200', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/email-events/campaign/${sendingCampaignId}`)
      .set('Cookie', ownerCookies)
      .expect(200);

    expect(response.body).toHaveLength(3);
    expect(response.body[0].contact.id).toBe(contactId);
  });

  it('GET /campaigns/:id/stats -> 200 with updated stats', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/campaigns/${sendingCampaignId}/stats`)
      .set('Cookie', ownerCookies)
      .expect(200);

    expect(response.body).toMatchObject({
      campaignId: sendingCampaignId,
      totalSent: 1,
      totalDelivered: 1,
      totalOpened: 1,
      totalClicked: 0,
    });
  });

  it('DELETE /campaigns/:id -> 400 for a sending campaign', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/campaigns/${sendingCampaignId}`)
      .set('Cookie', ownerCookies)
      .expect(400);
  });

  it('GET /campaigns -> 401 for anonymous requests', async () => {
    await request(app.getHttpServer()).get('/api/v1/campaigns').expect(401);
  });
});
