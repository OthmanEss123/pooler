/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FlowExecutionStatus, FlowStatus, StepStatus } from '@prisma/client';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ClickhouseService } from '../src/database/clickhouse/clickhouse.service';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { FlowRecoveryService } from '../src/modules/flows/flow-recovery.service';
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
  triggerRef: string;
  status: FlowExecutionStatus;
  currentStepIndex: number;
  startedAt: Date;
  timeoutAt: Date | null;
  lastHeartbeat: Date | null;
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

  const matchesDateFilter = (value: Date | null, filter: unknown) => {
    if (filter === undefined) {
      return true;
    }

    if (filter === null) {
      return value === null;
    }

    if (typeof filter !== 'object' || filter === null) {
      return value instanceof Date && filter instanceof Date
        ? value.getTime() === filter.getTime()
        : false;
    }

    if (value === null) {
      return false;
    }

    const typedFilter = filter as {
      lt?: Date;
      lte?: Date;
      gt?: Date;
      gte?: Date;
    };

    if (typedFilter.lt && !(value.getTime() < typedFilter.lt.getTime())) {
      return false;
    }

    if (typedFilter.lte && !(value.getTime() <= typedFilter.lte.getTime())) {
      return false;
    }

    if (typedFilter.gt && !(value.getTime() > typedFilter.gt.getTime())) {
      return false;
    }

    if (typedFilter.gte && !(value.getTime() >= typedFilter.gte.getTime())) {
      return false;
    }

    return true;
  };

  const matchesFlowWhere = (
    flow: MockFlow,
    where?: Record<string, unknown>,
  ) => {
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

  const matchesExecutionWhere = (
    execution: MockFlowExecution,
    where?: Record<string, unknown>,
  ) => {
    if (!where) {
      return true;
    }

    if (
      Array.isArray(where.OR) &&
      !(where.OR as Record<string, unknown>[]).some((item) =>
        matchesExecutionWhere(execution, item),
      )
    ) {
      return false;
    }

    if (where.id && execution.id !== where.id) {
      return false;
    }

    if (where.tenantId && execution.tenantId !== where.tenantId) {
      return false;
    }

    if (where.flowId && execution.flowId !== where.flowId) {
      return false;
    }

    if (where.contactId && execution.contactId !== where.contactId) {
      return false;
    }

    if (where.status && execution.status !== where.status) {
      return false;
    }

    if (where.triggerRef && execution.triggerRef !== where.triggerRef) {
      return false;
    }

    if (
      where.currentStepIndex !== undefined &&
      execution.currentStepIndex !== where.currentStepIndex
    ) {
      return false;
    }

    if (!matchesDateFilter(execution.startedAt, where.startedAt)) {
      return false;
    }

    if (!matchesDateFilter(execution.timeoutAt, where.timeoutAt)) {
      return false;
    }

    if (!matchesDateFilter(execution.lastHeartbeat, where.lastHeartbeat)) {
      return false;
    }

    return true;
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
      result.contact = await prismaMock.contact.findFirst({
        where: {
          id: execution.contactId,
          tenantId: execution.tenantId,
        },
      });
    }

    if (include?.steps) {
      result.steps = flowExecutionSteps
        .filter((step) => step.executionId === execution.id)
        .sort((left, right) =>
          include.steps?.orderBy?.createdAt === 'desc'
            ? right.createdAt.getTime() - left.createdAt.getTime()
            : left.createdAt.getTime() - right.createdAt.getTime(),
        );
    }

    return result;
  };

  prismaMock.flow = {
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const now = new Date();
      const flow: MockFlow = {
        id: `flow-recovery-${flowCounter++}`,
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
    findMany: jest.fn(async ({ where, orderBy }: any = {}) => {
      const filtered = flows.filter((flow) => matchesFlowWhere(flow, where));

      filtered.sort((left, right) =>
        orderBy?.createdAt === 'asc'
          ? left.createdAt.getTime() - right.createdAt.getTime()
          : right.createdAt.getTime() - left.createdAt.getTime(),
      );

      return filtered;
    }),
    findFirst: jest.fn(async ({ where }: any = {}) => {
      return flows.find((flow) => matchesFlowWhere(flow, where)) ?? null;
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const flow = flows.find((candidate) => candidate.id === where.id);
      if (!flow) {
        throw new Error('Flow not found');
      }

      Object.assign(flow, data, { updatedAt: new Date() });
      return flow;
    }),
    delete: jest.fn(async ({ where }: any) => {
      const index = flows.findIndex((candidate) => candidate.id === where.id);
      if (index === -1) {
        throw new Error('Flow not found');
      }

      const [flow] = flows.splice(index, 1);
      return flow;
    }),
  };

  prismaMock.flowExecution = {
    groupBy: jest.fn(async () => []),
    findFirst: jest.fn(async ({ where }: any = {}) => {
      return (
        flowExecutions.find((execution) =>
          matchesExecutionWhere(execution, where),
        ) ?? null
      );
    }),
    findUnique: jest.fn(async ({ where, include }: any) => {
      const execution =
        flowExecutions.find((candidate) => candidate.id === where.id) ?? null;

      if (!execution) {
        return null;
      }

      return includeExecutionRelations(execution, include);
    }),
    create: jest.fn(async ({ data }: any) => {
      const now = new Date();
      const startedAt = (data.startedAt as Date | undefined) ?? now;
      const execution: MockFlowExecution = {
        id: `flow-execution-recovery-${flowExecutionCounter++}`,
        flowId: String(data.flowId),
        contactId: String(data.contactId),
        tenantId: String(data.tenantId),
        triggerRef: String(data.triggerRef ?? `manual-${flowExecutionCounter}`),
        status:
          (data.status as FlowExecutionStatus | undefined) ??
          FlowExecutionStatus.RUNNING,
        currentStepIndex: Number(data.currentStepIndex ?? 0),
        startedAt,
        timeoutAt: (data.timeoutAt as Date | undefined) ?? null,
        lastHeartbeat: (data.lastHeartbeat as Date | undefined) ?? null,
        completedAt: (data.completedAt as Date | undefined) ?? null,
        failedAt: (data.failedAt as Date | undefined) ?? null,
        error: (data.error as string | undefined) ?? null,
        createdAt: now,
        updatedAt: now,
      };

      flowExecutions.push(execution);
      return execution;
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const execution = flowExecutions.find(
        (candidate) => candidate.id === where.id,
      );

      if (!execution) {
        throw new Error('Flow execution not found');
      }

      Object.assign(execution, data, { updatedAt: new Date() });
      return execution;
    }),
    findMany: jest.fn(async ({ where, include, orderBy }: any = {}) => {
      const filtered = flowExecutions.filter((execution) =>
        matchesExecutionWhere(execution, where),
      );

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
    }),
  };

  prismaMock.flowExecutionStep = {
    findFirst: jest.fn(async ({ where }: any = {}) => {
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
    }),
    create: jest.fn(async ({ data }: any) => {
      const now = new Date();
      const step: MockFlowExecutionStep = {
        id: `flow-execution-step-recovery-${flowExecutionStepCounter++}`,
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
    update: jest.fn(async ({ where, data }: any) => {
      const step = flowExecutionSteps.find(
        (candidate) => candidate.id === where.id,
      );
      if (!step) {
        throw new Error('Flow execution step not found');
      }

      Object.assign(step, data, { updatedAt: new Date() });
      return step;
    }),
  };

  return prismaMock;
};

describe('Flows Recovery (e2e)', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let recoveryService: FlowRecoveryService;
  let cookies: string[] = [];
  let tenantId = '';
  let contactId = '';

  const prismaMock = extendPrismaMock();

  const owner = {
    tenantName: 'Recovery Corp',
    tenantSlug: 'recovery-corp',
    email: 'recovery-owner@example.com',
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
    prisma = moduleFixture.get(PrismaService);
    recoveryService = moduleFixture.get(FlowRecoveryService);

    const registerResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(owner)
      .expect(201);

    cookies = toCookieHeader(
      registerResponse.headers['set-cookie'] as unknown as string[],
    );
    tenantId = registerResponse.body.user.tenantId as string;

    const contactResponse = await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Cookie', cookies)
      .send({
        email: 'recovery-contact@example.com',
        firstName: 'Recover',
        lastName: 'Me',
      })
      .expect(201);

    contactId = contactResponse.body.id as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it('execution RUNNING bloquee au step 0 -> FAILED', async () => {
    const flowResponse = await request(app.getHttpServer())
      .post('/api/v1/flows')
      .set('Cookie', cookies)
      .send({
        name: 'Recovery Fail Flow',
        trigger: { type: 'manual' },
        nodes: [
          {
            id: 'fail-node-1',
            type: 'exit',
          },
        ],
      })
      .expect(201);

    const flowId = flowResponse.body.id as string;

    await request(app.getHttpServer())
      .post(`/api/v1/flows/${flowId}/activate`)
      .set('Cookie', cookies)
      .expect(200);

    const triggerResponse = await request(app.getHttpServer())
      .post(`/api/v1/flows/${flowId}/trigger`)
      .set('Cookie', cookies)
      .send({ contactId })
      .expect(200);

    const executionId = triggerResponse.body.executionId as string;

    await prisma.flowExecution.update({
      where: { id: executionId },
      data: {
        startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        timeoutAt: new Date(Date.now() + 60 * 60 * 1000),
        lastHeartbeat: new Date(Date.now() - 20 * 60 * 1000),
      },
    });

    const recovery = await recoveryService.recoverStuckExecutions();
    expect(recovery.failed).toBeGreaterThanOrEqual(1);

    const executionsResponse = await request(app.getHttpServer())
      .get(`/api/v1/flows/${flowId}/executions`)
      .set('Cookie', cookies)
      .expect(200);

    expect(executionsResponse.body[0]).toEqual(
      expect.objectContaining({
        id: executionId,
        status: 'FAILED',
        error: 'Execution timeout',
      }),
    );
    expect(executionsResponse.body[0].lastHeartbeat).toEqual(
      expect.any(String),
    );
  });

  it('execution bloquee apres un step -> reprise depuis le bon index', async () => {
    const flowResponse = await request(app.getHttpServer())
      .post('/api/v1/flows')
      .set('Cookie', cookies)
      .send({
        name: 'Recovery Resume Flow',
        trigger: { type: 'manual' },
        nodes: [
          {
            id: 'resume-node-1',
            type: 'send_email',
            config: {
              subject: 'Resume',
              body: 'Resume body',
            },
            nextId: 'resume-node-2',
          },
          {
            id: 'resume-node-2',
            type: 'exit',
          },
        ],
      })
      .expect(201);

    const flowId = flowResponse.body.id as string;

    await request(app.getHttpServer())
      .post(`/api/v1/flows/${flowId}/activate`)
      .set('Cookie', cookies)
      .expect(200);

    const execution = await prisma.flowExecution.create({
      data: {
        tenantId,
        flowId,
        contactId,
        triggerRef: 'resume-manual-ref',
        status: FlowExecutionStatus.RUNNING,
        currentStepIndex: 1,
        startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        timeoutAt: new Date(Date.now() + 60 * 60 * 1000),
        lastHeartbeat: new Date(Date.now() - 20 * 60 * 1000),
      },
    });

    const recovery = await recoveryService.recoverStuckExecutions();
    expect(recovery.recovered).toBeGreaterThanOrEqual(1);

    const executionsResponse = await request(app.getHttpServer())
      .get(`/api/v1/flows/${flowId}/executions`)
      .set('Cookie', cookies)
      .expect(200);

    const resumedExecution = executionsResponse.body.find(
      (item: { id: string }) => item.id === execution.id,
    );

    expect(resumedExecution).toEqual(
      expect.objectContaining({
        id: execution.id,
        status: 'COMPLETED',
      }),
    );
    expect(Array.isArray(resumedExecution.steps)).toBe(true);
    expect(resumedExecution.steps[0]).toEqual(
      expect.objectContaining({
        stepId: 'resume-node-2',
        status: 'COMPLETED',
      }),
    );
  });

  it('double trigger le meme jour -> meme execution et pas de doublon', async () => {
    const flowResponse = await request(app.getHttpServer())
      .post('/api/v1/flows')
      .set('Cookie', cookies)
      .send({
        name: 'Idempotent Flow',
        trigger: { type: 'manual' },
        nodes: [
          {
            id: 'idempotent-node-1',
            type: 'exit',
          },
        ],
      })
      .expect(201);

    const flowId = flowResponse.body.id as string;

    await request(app.getHttpServer())
      .post(`/api/v1/flows/${flowId}/activate`)
      .set('Cookie', cookies)
      .expect(200);

    const firstTrigger = await request(app.getHttpServer())
      .post(`/api/v1/flows/${flowId}/trigger`)
      .set('Cookie', cookies)
      .send({ contactId })
      .expect(200);

    const secondTrigger = await request(app.getHttpServer())
      .post(`/api/v1/flows/${flowId}/trigger`)
      .set('Cookie', cookies)
      .send({ contactId })
      .expect(200);

    expect(firstTrigger.body.executionId).toBe(secondTrigger.body.executionId);
    expect(secondTrigger.body.duplicated).toBe(true);

    const executionsResponse = await request(app.getHttpServer())
      .get(`/api/v1/flows/${flowId}/executions`)
      .set('Cookie', cookies)
      .expect(200);

    expect(executionsResponse.body).toHaveLength(1);
  });
});
