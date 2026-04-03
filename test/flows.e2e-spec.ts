/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ApiKeyScope,
  FlowExecutionStatus,
  FlowStatus,
  StepStatus,
} from '@prisma/client';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ClickhouseService } from '../src/database/clickhouse/clickhouse.service';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { createCommercePrismaMock } from './support/create-commerce-prisma-mock';
import { toCookieHeader } from './support/create-prisma-mock';

process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??=
  'postgresql://user:password@localhost:5432/pilot_platform';
process.env.DIRECT_URL ??=
  'postgresql://user:password@localhost:5432/pilot_platform';
process.env.CLICKHOUSE_URL ??= 'http://default:password@localhost:8123/pilot';
process.env.JWT_SECRET ??=
  '1234567890123456789012345678901234567890123456789012345678901234';
process.env.JWT_EXPIRES_IN ??= '15m';

interface MockFlow {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  trigger: Record<string, unknown>;
  nodes: Array<Record<string, unknown>>;
  status: FlowStatus;
  createdAt: Date;
  updatedAt: Date;
}

interface MockFlowExecution {
  id: string;
  flowId: string;
  contactId: string;
  tenantId: string;
  status: FlowExecutionStatus;
  currentStepIndex: number;
  startedAt: Date;
  completedAt: Date | null;
  failedAt: Date | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MockFlowExecutionStep {
  id: string;
  executionId: string;
  stepId: string;
  type: string;
  status: StepStatus;
  executedAt: Date | null;
  result: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

const extendPrismaMock = () => {
  const prismaMock = createCommercePrismaMock() as Record<string, any>;
  const flows: MockFlow[] = [];
  const flowExecutions: MockFlowExecution[] = [];
  const flowExecutionSteps: MockFlowExecutionStep[] = [];

  let flowCounter = 1;
  let flowExecutionCounter = 1;
  let flowExecutionStepCounter = 1;

  const matchesFlowWhere = (
    flow: MockFlow,
    where?: Record<string, unknown>,
  ): boolean => {
    if (!where) {
      return true;
    }

    if (where.id && flow.id !== where.id) {
      return false;
    }

    if (where.tenantId && flow.tenantId !== where.tenantId) {
      return false;
    }

    if (where.status && flow.status !== where.status) {
      return false;
    }

    if (
      where.trigger &&
      typeof where.trigger === 'object' &&
      Array.isArray((where.trigger as { path?: string[] }).path) &&
      (where.trigger as { path?: string[] }).path?.[0] === 'type' &&
      (where.trigger as { equals?: string }).equals &&
      flow.trigger.type !== (where.trigger as { equals?: string }).equals
    ) {
      return false;
    }

    return true;
  };

  const findContact = async (contactId: string, tenantId: string) => {
    return prismaMock.contact.findFirst({
      where: {
        id: contactId,
        tenantId,
      },
    });
  };

  const includeExecutionRelations = async (
    execution: MockFlowExecution,
    include?: {
      flow?: boolean;
      contact?: boolean;
      steps?: { orderBy?: { createdAt?: 'asc' | 'desc' } };
    },
  ) => {
    const result: Record<string, unknown> = { ...execution };

    if (include?.flow) {
      result.flow = flows.find((flow) => flow.id === execution.flowId) ?? null;
    }

    if (include?.contact) {
      result.contact = await findContact(
        execution.contactId,
        execution.tenantId,
      );
    }

    if (include?.steps) {
      const steps = flowExecutionSteps
        .filter((step) => step.executionId === execution.id)
        .sort((left, right) =>
          include.steps?.orderBy?.createdAt === 'desc'
            ? right.createdAt.getTime() - left.createdAt.getTime()
            : left.createdAt.getTime() - right.createdAt.getTime(),
        );

      result.steps = steps;
    }

    return result;
  };

  prismaMock.flow = {
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const now = new Date();
      const flow: MockFlow = {
        id: `flow-${flowCounter++}`,
        tenantId: String(data.tenantId),
        name: String(data.name),
        description: (data.description as string | undefined) ?? null,
        trigger: (data.trigger as Record<string, unknown>) ?? {},
        nodes: (data.nodes as Array<Record<string, unknown>>) ?? [],
        status: (data.status as FlowStatus | undefined) ?? FlowStatus.DRAFT,
        createdAt: now,
        updatedAt: now,
      };

      flows.push(flow);
      return flow;
    }),
    findMany: jest.fn(
      async ({
        where,
        orderBy,
      }: {
        where?: Record<string, unknown>;
        orderBy?: { createdAt?: 'asc' | 'desc' };
      } = {}) => {
        const filtered = flows.filter((flow) => matchesFlowWhere(flow, where));

        filtered.sort((left, right) =>
          orderBy?.createdAt === 'asc'
            ? left.createdAt.getTime() - right.createdAt.getTime()
            : right.createdAt.getTime() - left.createdAt.getTime(),
        );

        return filtered;
      },
    ),
    findFirst: jest.fn(
      async ({ where }: { where?: Record<string, unknown> } = {}) => {
        return flows.find((flow) => matchesFlowWhere(flow, where)) ?? null;
      },
    ),
    update: jest.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const flow = flows.find((candidate) => candidate.id === where.id);

        if (!flow) {
          throw new Error('Flow not found');
        }

        Object.assign(flow, data, { updatedAt: new Date() });
        return flow;
      },
    ),
    delete: jest.fn(async ({ where }: { where: { id: string } }) => {
      const index = flows.findIndex((candidate) => candidate.id === where.id);

      if (index === -1) {
        throw new Error('Flow not found');
      }

      const [flow] = flows.splice(index, 1);

      for (let i = flowExecutions.length - 1; i >= 0; i -= 1) {
        if (flowExecutions[i].flowId === flow.id) {
          const executionId = flowExecutions[i].id;
          flowExecutions.splice(i, 1);

          for (let j = flowExecutionSteps.length - 1; j >= 0; j -= 1) {
            if (flowExecutionSteps[j].executionId === executionId) {
              flowExecutionSteps.splice(j, 1);
            }
          }
        }
      }

      return flow;
    }),
  };

  prismaMock.flowExecution = {
    groupBy: jest.fn(
      async ({
        where,
      }: {
        by: string[];
        where?: Record<string, unknown>;
        _count?: { _all?: boolean };
      }) => {
        const filtered = flowExecutions.filter((execution) => {
          if (where?.tenantId && execution.tenantId !== where.tenantId) {
            return false;
          }

          if (where?.status && execution.status !== where.status) {
            return false;
          }

          return true;
        });

        const counts = new Map<string, number>();
        for (const execution of filtered) {
          counts.set(execution.flowId, (counts.get(execution.flowId) ?? 0) + 1);
        }

        return Array.from(counts.entries()).map(([flowId, count]) => ({
          flowId,
          _count: { _all: count },
        }));
      },
    ),
    findFirst: jest.fn(
      async ({ where }: { where?: Record<string, unknown> } = {}) => {
        return (
          flowExecutions.find((execution) => {
            if (where?.id && execution.id !== where.id) {
              return false;
            }

            if (where?.tenantId && execution.tenantId !== where.tenantId) {
              return false;
            }

            if (where?.flowId && execution.flowId !== where.flowId) {
              return false;
            }

            if (where?.contactId && execution.contactId !== where.contactId) {
              return false;
            }

            if (where?.status && execution.status !== where.status) {
              return false;
            }

            return true;
          }) ?? null
        );
      },
    ),
    findUnique: jest.fn(
      async ({
        where,
        include,
      }: {
        where: { id: string };
        include?: { flow?: boolean; contact?: boolean };
      }) => {
        const execution =
          flowExecutions.find((candidate) => candidate.id === where.id) ?? null;

        if (!execution) {
          return null;
        }

        return includeExecutionRelations(execution, include);
      },
    ),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const now = new Date();
      const execution: MockFlowExecution = {
        id: `flow-execution-${flowExecutionCounter++}`,
        flowId: String(data.flowId),
        contactId: String(data.contactId),
        tenantId: String(data.tenantId),
        status:
          (data.status as FlowExecutionStatus | undefined) ??
          FlowExecutionStatus.RUNNING,
        currentStepIndex: Number(data.currentStepIndex ?? 0),
        startedAt: now,
        completedAt: null,
        failedAt: null,
        error: null,
        createdAt: now,
        updatedAt: now,
      };

      flowExecutions.push(execution);
      return execution;
    }),
    update: jest.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const execution = flowExecutions.find(
          (candidate) => candidate.id === where.id,
        );

        if (!execution) {
          throw new Error('Flow execution not found');
        }

        Object.assign(execution, data, { updatedAt: new Date() });
        return execution;
      },
    ),
    findMany: jest.fn(
      async ({
        where,
        include,
        orderBy,
      }: {
        where?: Record<string, unknown>;
        include?: {
          steps?: { orderBy?: { createdAt?: 'asc' | 'desc' } };
          flow?: boolean;
          contact?: boolean;
        };
        orderBy?: { startedAt?: 'asc' | 'desc' };
      } = {}) => {
        const filtered = flowExecutions.filter((execution) => {
          if (where?.tenantId && execution.tenantId !== where.tenantId) {
            return false;
          }

          if (where?.flowId && execution.flowId !== where.flowId) {
            return false;
          }

          if (where?.contactId && execution.contactId !== where.contactId) {
            return false;
          }

          if (where?.status && execution.status !== where.status) {
            return false;
          }

          return true;
        });

        filtered.sort((left, right) =>
          orderBy?.startedAt === 'asc'
            ? left.startedAt.getTime() - right.startedAt.getTime()
            : right.startedAt.getTime() - left.startedAt.getTime(),
        );

        return Promise.all(
          filtered.map((execution) =>
            includeExecutionRelations(execution, include),
          ),
        );
      },
    ),
  };

  prismaMock.flowExecutionStep = {
    findFirst: jest.fn(
      async ({ where }: { where?: Record<string, unknown> } = {}) => {
        return (
          flowExecutionSteps.find((step) => {
            if (where?.executionId && step.executionId !== where.executionId) {
              return false;
            }

            if (where?.stepId && step.stepId !== where.stepId) {
              return false;
            }

            if (where?.status && step.status !== where.status) {
              return false;
            }

            return true;
          }) ?? null
        );
      },
    ),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const now = new Date();
      const step: MockFlowExecutionStep = {
        id: `flow-execution-step-${flowExecutionStepCounter++}`,
        executionId: String(data.executionId),
        stepId: String(data.stepId),
        type: String(data.type),
        status: (data.status as StepStatus | undefined) ?? StepStatus.PENDING,
        executedAt: (data.executedAt as Date | undefined) ?? null,
        result: (data.result as Record<string, unknown> | undefined) ?? null,
        createdAt: now,
        updatedAt: now,
      };

      flowExecutionSteps.push(step);
      return step;
    }),
    update: jest.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const step = flowExecutionSteps.find(
          (candidate) => candidate.id === where.id,
        );

        if (!step) {
          throw new Error('Flow execution step not found');
        }

        Object.assign(step, data, { updatedAt: new Date() });
        return step;
      },
    ),
  };

  return prismaMock;
};

describe('Flows (e2e)', () => {
  let app: INestApplication<Server>;
  let cookies: string[] = [];
  let readOnlyApiKey = '';
  let flowId = '';
  let autoFlowId = '';
  let contactId = '';

  const prismaMock = extendPrismaMock();

  const owner = {
    tenantName: 'Flows Corp',
    tenantSlug: 'flows-corp',
    email: 'flows-owner@example.com',
    password: 'Password123!',
  };

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

    cookies = toCookieHeader(
      registerResponse.headers['set-cookie'] as unknown as string[],
    );

    const apiKeyResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/api-keys')
      .set('Cookie', cookies)
      .send({ name: 'Flows Read Only', scope: ApiKeyScope.READ_ONLY })
      .expect(201);

    readOnlyApiKey = apiKeyResponse.body.key as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /flows -> 201', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/flows')
      .set('Cookie', cookies)
      .send({
        name: 'Welcome Flow',
        description: 'Flow test',
        trigger: {
          type: 'manual',
        },
        nodes: [
          {
            id: 'node-1',
            type: 'send_email',
            config: {
              subject: 'Bienvenue',
              body: 'Hello',
            },
            nextId: 'node-2',
          },
          {
            id: 'node-2',
            type: 'exit',
          },
        ],
      })
      .expect(201);

    flowId = response.body.id as string;
    expect(response.body.status).toBe('DRAFT');
  });

  it('GET /flows -> 200', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/flows')
      .set('Cookie', cookies)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body[0].id).toBe(flowId);
  });

  it('GET /flows/:id -> 200', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/flows/${flowId}`)
      .set('Cookie', cookies)
      .expect(200);

    expect(response.body.id).toBe(flowId);
  });

  it('PATCH /flows/:id -> 200', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/flows/${flowId}`)
      .set('Cookie', cookies)
      .send({
        description: 'Updated description',
      })
      .expect(200);

    expect(response.body.description).toBe('Updated description');
  });

  it('GET /flows/:id/executions -> 200 []', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/flows/${flowId}/executions`)
      .set('Cookie', cookies)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toHaveLength(0);
  });

  it('POST /flows/:id/activate -> 200 ACTIVE', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/flows/${flowId}/activate`)
      .set('Cookie', cookies)
      .expect(200);

    expect(response.body.status).toBe('ACTIVE');
  });

  it('PATCH /flows/:id -> 400 si ACTIVE', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/flows/${flowId}`)
      .set('Cookie', cookies)
      .send({
        name: 'Should fail',
      })
      .expect(400);
  });

  it('POST /flows/:id/pause -> 200 PAUSED', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/flows/${flowId}/pause`)
      .set('Cookie', cookies)
      .expect(200);

    expect(response.body.status).toBe('PAUSED');
  });

  it('POST /flows/:id/activate -> 200 ACTIVE again', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/flows/${flowId}/activate`)
      .set('Cookie', cookies)
      .expect(200);

    expect(response.body.status).toBe('ACTIVE');
  });

  it('DELETE /flows/:id -> 400 si ACTIVE', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/flows/${flowId}`)
      .set('Cookie', cookies)
      .expect(400);
  });

  it('Create contact', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Cookie', cookies)
      .send({
        email: 'contact@test.com',
        firstName: 'John',
        lastName: 'Doe',
      })
      .expect(201);

    contactId = response.body.id as string;
  });

  it('POST /flows/:id/trigger -> 200 executionId', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/flows/${flowId}/trigger`)
      .set('Cookie', cookies)
      .send({ contactId })
      .expect(200);

    expect(response.body.executionId).toBeDefined();
  });

  it('GET /flows/:id/executions -> 200 1 execution', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/flows/${flowId}/executions`)
      .set('Cookie', cookies)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThanOrEqual(1);
    expect(response.body[0].flowId).toBe(flowId);
  });

  it('POST /flows -> 401 sans cookie', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/flows')
      .send({
        name: 'Unauthorized',
        trigger: { type: 'manual' },
        nodes: [{ id: 'n1', type: 'exit' }],
      })
      .expect(401);
  });

  it('POST /flows/:id/activate -> 403 API key read-only', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/flows/${flowId}/activate`)
      .set('x-api-key', readOnlyApiKey)
      .expect(403);
  });

  it('POST /flows -> 201 for a contact_created flow', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/flows')
      .set('Cookie', cookies)
      .send({
        name: 'Contact Created Flow',
        trigger: { type: 'contact_created' },
        nodes: [
          {
            id: 'auto-node-1',
            type: 'exit',
          },
        ],
      })
      .expect(201);

    autoFlowId = response.body.id as string;
  });

  it('POST /flows/:id/activate -> 200 for contact_created flow', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/flows/${autoFlowId}/activate`)
      .set('Cookie', cookies)
      .expect(200);
  });

  it('POST /contacts -> 201 triggers contact_created flow automatically', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Cookie', cookies)
      .send({
        email: 'auto-flow@test.com',
        firstName: 'Auto',
        lastName: 'Trigger',
      })
      .expect(201);

    const executionsResponse = await request(app.getHttpServer())
      .get(`/api/v1/flows/${autoFlowId}/executions`)
      .set('Cookie', cookies)
      .expect(200);

    expect(executionsResponse.body.length).toBeGreaterThanOrEqual(1);
  });
});
