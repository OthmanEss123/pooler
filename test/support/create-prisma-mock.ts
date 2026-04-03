/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unnecessary-type-assertion */
import {
  ApiKeyScope,
  EmailStatus,
  SegmentType,
  UserRole,
} from '@prisma/client';

export interface MockTenant {
  [key: string]: unknown;
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MockUser {
  [key: string]: unknown;
  id: string;
  tenantId: string;
  email: string;
  passwordHash: string;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MockMembership {
  id: string;
  tenantId: string;
  userId: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface MockRefreshToken {
  [key: string]: unknown;
  id: string;
  tenantId: string;
  userId: string;
  tokenHash: string;
  tokenFamily: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  replacedByTokenId: string | null;
  userAgent: string | null;
  ipAddress: string | null;
}

export interface MockApiKey {
  id: string;
  tenantId: string;
  name: string;
  prefix: string;
  keyHash: string;
  scope: ApiKeyScope;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MockContact {
  [key: string]: unknown;
  id: string;
  tenantId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  emailStatus: EmailStatus;
  totalRevenue: number;
  totalOrders: number;
  firstOrderAt: Date | null;
  lastOrderAt: Date | null;
  healthScore: { segment?: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MockSegment {
  [key: string]: unknown;
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  type: SegmentType;
  conditions: unknown;
  contactCount: number;
  lastSyncAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MockSegmentMember {
  segmentId: string;
  contactId: string;
  addedAt: Date;
}

export interface MockAdAudience {
  id: string;
  tenantId: string;
  adCampaignId: string | null;
  segmentId: string | null;
  externalId: string | null;
  name: string;
  memberCount: number;
  lastSyncAt: Date | null;
  createdAt: Date;
}

export interface MockAdAudienceMember {
  audienceId: string;
  contactId: string;
  addedAt: Date;
}

type SelectMap = Record<string, boolean | { select: SelectMap }>;

type ComparableValue = number | Date | null;

const pickSelected = (
  source: Record<string, unknown>,
  select: SelectMap,
  relations: Record<string, Record<string, unknown> | null> = {},
): Record<string, unknown> => {
  return Object.fromEntries(
    Object.entries(select)
      .filter(([, value]) => value)
      .map(([key, value]) => {
        if (typeof value === 'object' && value !== null && 'select' in value) {
          const relation = relations[key];
          const nestedSelect = value.select as SelectMap;

          return [key, relation ? pickSelected(relation, nestedSelect) : null];
        }

        return [key, source[key]];
      }),
  );
};

const normalizeComparable = (value: number | Date) =>
  value instanceof Date ? value.getTime() : value;

const matchesComparable = (value: ComparableValue, filter: unknown) => {
  if (filter === undefined) {
    return true;
  }

  if (typeof filter === 'number' || filter instanceof Date) {
    if (value === null) {
      return false;
    }

    return normalizeComparable(value) === normalizeComparable(filter);
  }

  if (typeof filter !== 'object' || filter === null) {
    return false;
  }

  if (value === null) {
    return false;
  }

  const candidate = filter as {
    gt?: number | Date;
    gte?: number | Date;
    lt?: number | Date;
    lte?: number | Date;
  };
  const actual = normalizeComparable(value);

  if (
    candidate.gt !== undefined &&
    !(actual > normalizeComparable(candidate.gt))
  ) {
    return false;
  }

  if (
    candidate.gte !== undefined &&
    !(actual >= normalizeComparable(candidate.gte))
  ) {
    return false;
  }

  if (
    candidate.lt !== undefined &&
    !(actual < normalizeComparable(candidate.lt))
  ) {
    return false;
  }

  if (
    candidate.lte !== undefined &&
    !(actual <= normalizeComparable(candidate.lte))
  ) {
    return false;
  }

  return true;
};

const matchesContactWhere = (
  contact: MockContact,
  where?: Record<string, unknown>,
): boolean => {
  if (!where) {
    return true;
  }

  if (where.tenantId && contact.tenantId !== where.tenantId) {
    return false;
  }

  if (
    Array.isArray(where.AND) &&
    !(where.AND as Record<string, unknown>[]).every((item) =>
      matchesContactWhere(contact, item),
    )
  ) {
    return false;
  }

  if (
    Array.isArray(where.OR) &&
    !(where.OR as Record<string, unknown>[]).some((item) =>
      matchesContactWhere(contact, item),
    )
  ) {
    return false;
  }

  if (
    where.NOT &&
    matchesContactWhere(contact, where.NOT as Record<string, unknown>)
  ) {
    return false;
  }

  if (where.emailStatus !== undefined) {
    if (typeof where.emailStatus === 'string') {
      if (contact.emailStatus !== where.emailStatus) {
        return false;
      }
    } else if (
      typeof where.emailStatus === 'object' &&
      where.emailStatus !== null &&
      'in' in where.emailStatus
    ) {
      const values = (where.emailStatus as { in: EmailStatus[] }).in;

      if (!values.includes(contact.emailStatus)) {
        return false;
      }
    }
  }

  if (!matchesComparable(contact.totalRevenue, where.totalRevenue)) {
    return false;
  }

  if (!matchesComparable(contact.totalOrders, where.totalOrders)) {
    return false;
  }

  if (!matchesComparable(contact.firstOrderAt, where.firstOrderAt)) {
    return false;
  }

  if (!matchesComparable(contact.lastOrderAt, where.lastOrderAt)) {
    return false;
  }

  if (
    where.healthScore &&
    typeof where.healthScore === 'object' &&
    'equals' in where.healthScore
  ) {
    const scoreFilter = where.healthScore as {
      path?: string[];
      equals?: string;
    };

    if (scoreFilter.path?.[0] === 'segment') {
      if (
        (contact.healthScore?.segment ?? null) !== (scoreFilter.equals ?? null)
      ) {
        return false;
      }
    }
  }

  return true;
};

export const createPrismaMock = () => {
  const tenants: MockTenant[] = [];
  const users: MockUser[] = [];
  const memberships: MockMembership[] = [];
  const refreshTokens: MockRefreshToken[] = [];
  const apiKeys: MockApiKey[] = [];
  const contacts: MockContact[] = [];
  const segments: MockSegment[] = [];
  const segmentMembers: MockSegmentMember[] = [];
  const adAudiences: MockAdAudience[] = [];
  const adAudienceMembers: MockAdAudienceMember[] = [];

  let tenantCounter = 1;
  let userCounter = 1;
  let membershipCounter = 1;
  let refreshTokenCounter = 1;
  let apiKeyCounter = 1;
  let contactCounter = 1;
  let segmentCounter = 1;
  let adAudienceCounter = 1;

  const seedContactsForTenant = (tenantId: string) => {
    const now = new Date();

    contacts.push({
      id: `contact-${contactCounter++}`,
      tenantId,
      email: `subscribed-${tenantId}@example.com`,
      firstName: 'Subscribed',
      lastName: 'Customer',
      phone: null,
      emailStatus: EmailStatus.SUBSCRIBED,
      totalRevenue: 1250,
      totalOrders: 3,
      firstOrderAt: new Date('2025-01-10T00:00:00.000Z'),
      lastOrderAt: new Date('2025-02-14T00:00:00.000Z'),
      healthScore: { segment: 'champion' },
      createdAt: now,
      updatedAt: now,
    });

    contacts.push({
      id: `contact-${contactCounter++}`,
      tenantId,
      email: `pending-${tenantId}@example.com`,
      firstName: 'Pending',
      lastName: 'Lead',
      phone: null,
      emailStatus: EmailStatus.PENDING,
      totalRevenue: 0,
      totalOrders: 0,
      firstOrderAt: null,
      lastOrderAt: null,
      healthScore: { segment: 'new' },
      createdAt: now,
      updatedAt: now,
    });
  };
  const prismaMock: Record<string, any> = {
    tenant: {
      findUnique: jest.fn(
        async ({
          where,
          select,
        }: {
          where: { id?: string; slug?: string };
          select?: SelectMap;
        }) => {
          const tenant =
            tenants.find((candidate) => candidate.id === where.id) ??
            tenants.find((candidate) => candidate.slug === where.slug) ??
            null;

          if (!tenant) {
            return null;
          }

          if (select) {
            return pickSelected(tenant as Record<string, unknown>, select);
          }

          return tenant;
        },
      ),
      create: jest.fn(
        async ({ data }: { data: { name: string; slug: string } }) => {
          const now = new Date();
          const tenant: MockTenant = {
            id: `tenant-${tenantCounter++}`,
            name: data.name,
            slug: data.slug,
            isActive: true,
            createdAt: now,
            updatedAt: now,
          };

          tenants.push(tenant);
          seedContactsForTenant(tenant.id);
          return tenant;
        },
      ),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<MockTenant>;
        }) => {
          const tenant = tenants.find((candidate) => candidate.id === where.id);
          if (!tenant) {
            throw new Error('Tenant not found');
          }

          Object.assign(tenant, data, { updatedAt: new Date() });
          return tenant;
        },
      ),
    },
    user: {
      findUnique: jest.fn(
        async ({
          where,
          include,
          select,
        }: {
          where: { id?: string; email?: string };
          include?: { tenant?: boolean };
          select?: SelectMap;
        }) => {
          const user =
            users.find((candidate) => candidate.id === where.id) ??
            users.find((candidate) => candidate.email === where.email) ??
            null;

          if (!user) {
            return null;
          }

          const tenant =
            tenants.find((candidate) => candidate.id === user.tenantId) ?? null;

          if (include?.tenant) {
            return tenant ? { ...user, tenant } : null;
          }

          if (select) {
            return pickSelected(user as Record<string, unknown>, select, {
              tenant: tenant as Record<string, unknown> | null,
            });
          }

          return user;
        },
      ),
      create: jest.fn(
        async ({
          data,
        }: {
          data: {
            tenantId: string;
            email: string;
            passwordHash: string;
            firstName?: string;
            lastName?: string;
            role: UserRole;
          };
        }) => {
          const now = new Date();
          const user: MockUser = {
            id: `user-${userCounter++}`,
            tenantId: data.tenantId,
            email: data.email,
            passwordHash: data.passwordHash,
            firstName: data.firstName ?? null,
            lastName: data.lastName ?? null,
            role: data.role,
            isActive: true,
            lastLoginAt: null,
            createdAt: now,
            updatedAt: now,
          };

          users.push(user);
          return user;
        },
      ),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<MockUser>;
        }) => {
          const user = users.find((candidate) => candidate.id === where.id);
          if (!user) {
            throw new Error('User not found');
          }

          Object.assign(user, data, { updatedAt: new Date() });
          return user;
        },
      ),
    },
    membership: {
      findUnique: jest.fn(
        async ({
          where,
        }: {
          where: {
            id?: string;
            tenantId_userId?: { tenantId: string; userId: string };
          };
        }) => {
          if (where.id) {
            return (
              memberships.find((candidate) => candidate.id === where.id) ?? null
            );
          }

          if (where.tenantId_userId) {
            return (
              memberships.find(
                (candidate) =>
                  candidate.tenantId === where.tenantId_userId?.tenantId &&
                  candidate.userId === where.tenantId_userId?.userId,
              ) ?? null
            );
          }

          return null;
        },
      ),
      findMany: jest.fn(
        async ({
          where,
          include,
          orderBy,
        }: {
          where?: { tenantId?: string };
          include?: { user?: { select: SelectMap } };
          orderBy?: { createdAt: 'asc' | 'desc' };
        }) => {
          const filtered = memberships.filter((candidate) => {
            if (where?.tenantId && candidate.tenantId !== where.tenantId) {
              return false;
            }

            return true;
          });

          filtered.sort((left, right) =>
            orderBy?.createdAt === 'desc'
              ? right.createdAt.getTime() - left.createdAt.getTime()
              : left.createdAt.getTime() - right.createdAt.getTime(),
          );

          if (!include?.user) {
            return filtered;
          }

          return filtered.map((membership) => {
            const user = users.find(
              (candidate) => candidate.id === membership.userId,
            );
            if (!user) {
              return membership;
            }

            return {
              ...membership,
              user: pickSelected(
                user as Record<string, unknown>,
                include.user!.select,
              ),
            };
          });
        },
      ),
      count: jest.fn(async ({ where }: { where?: { tenantId?: string } }) => {
        return memberships.filter((candidate) => {
          if (where?.tenantId && candidate.tenantId !== where.tenantId) {
            return false;
          }

          return true;
        }).length;
      }),
      create: jest.fn(
        async ({
          data,
          include,
        }: {
          data: { tenantId: string; userId: string; role: UserRole };
          include?: { user?: { select: SelectMap } };
        }) => {
          const now = new Date();
          const membership: MockMembership = {
            id: `membership-${membershipCounter++}`,
            tenantId: data.tenantId,
            userId: data.userId,
            role: data.role,
            createdAt: now,
            updatedAt: now,
          };

          memberships.push(membership);

          if (!include?.user) {
            return membership;
          }

          const user = users.find(
            (candidate) => candidate.id === membership.userId,
          );
          return {
            ...membership,
            user: user
              ? pickSelected(
                  user as Record<string, unknown>,
                  include.user!.select,
                )
              : null,
          };
        },
      ),
      update: jest.fn(
        async ({
          where,
          data,
          include,
        }: {
          where: { id: string };
          data: Partial<MockMembership>;
          include?: { user?: { select: SelectMap } };
        }) => {
          const membership = memberships.find(
            (candidate) => candidate.id === where.id,
          );
          if (!membership) {
            throw new Error('Membership not found');
          }

          Object.assign(membership, data, { updatedAt: new Date() });

          if (!include?.user) {
            return membership;
          }

          const user = users.find(
            (candidate) => candidate.id === membership.userId,
          );
          return {
            ...membership,
            user: user
              ? pickSelected(
                  user as Record<string, unknown>,
                  include.user!.select,
                )
              : null,
          };
        },
      ),
      delete: jest.fn(async ({ where }: { where: { id: string } }) => {
        const index = memberships.findIndex(
          (candidate) => candidate.id === where.id,
        );
        if (index === -1) {
          throw new Error('Membership not found');
        }

        const [membership] = memberships.splice(index, 1);
        return membership;
      }),
    },
    refreshToken: {
      findUnique: jest.fn(
        async ({
          where,
          include,
        }: {
          where: { tokenHash: string };
          include?: { user?: boolean };
        }) => {
          const refreshToken =
            refreshTokens.find(
              (candidate) => candidate.tokenHash === where.tokenHash,
            ) ?? null;

          if (!refreshToken) {
            return null;
          }

          if (include?.user) {
            const user = users.find(
              (candidate) => candidate.id === refreshToken.userId,
            );
            return user ? { ...refreshToken, user } : null;
          }

          return refreshToken;
        },
      ),
      findFirst: jest.fn(
        async ({
          where,
          orderBy,
          select,
        }: {
          where?: { tokenFamily?: string };
          orderBy?: { createdAt: 'asc' | 'desc' };
          select?: SelectMap;
        }) => {
          const filtered = refreshTokens.filter((candidate) => {
            if (
              where?.tokenFamily &&
              candidate.tokenFamily !== where.tokenFamily
            ) {
              return false;
            }

            return true;
          });

          filtered.sort((left, right) =>
            orderBy?.createdAt === 'asc'
              ? left.createdAt.getTime() - right.createdAt.getTime()
              : right.createdAt.getTime() - left.createdAt.getTime(),
          );

          const refreshToken = filtered[0] ?? null;

          if (!refreshToken) {
            return null;
          }

          if (!select) {
            return refreshToken;
          }

          return pickSelected(refreshToken as Record<string, unknown>, select);
        },
      ),
      create: jest.fn(
        async ({
          data,
        }: {
          data: {
            tenantId: string;
            userId: string;
            tokenHash: string;
            tokenFamily: string;
            expiresAt: Date;
            userAgent?: string;
            ipAddress?: string;
          };
        }) => {
          const refreshToken: MockRefreshToken = {
            id: `refresh-${refreshTokenCounter++}`,
            tenantId: data.tenantId,
            userId: data.userId,
            tokenHash: data.tokenHash,
            tokenFamily: data.tokenFamily,
            expiresAt: data.expiresAt,
            revokedAt: null,
            createdAt: new Date(),
            replacedByTokenId: null,
            userAgent: data.userAgent ?? null,
            ipAddress: data.ipAddress ?? null,
          };

          refreshTokens.push(refreshToken);
          return refreshToken;
        },
      ),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<MockRefreshToken>;
        }) => {
          const refreshToken = refreshTokens.find(
            (candidate) => candidate.id === where.id,
          );
          if (!refreshToken) {
            throw new Error('Refresh token not found');
          }

          Object.assign(refreshToken, data);
          return refreshToken;
        },
      ),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { tokenFamily: string };
          data: Partial<MockRefreshToken>;
        }) => {
          let count = 0;

          for (const refreshToken of refreshTokens) {
            if (refreshToken.tokenFamily === where.tokenFamily) {
              Object.assign(refreshToken, data);
              count += 1;
            }
          }

          return { count };
        },
      ),
      deleteMany: jest.fn(
        async ({ where }: { where?: { expiresAt?: { lt?: Date } } }) => {
          let count = 0;

          for (let index = refreshTokens.length - 1; index >= 0; index -= 1) {
            if (
              where?.expiresAt?.lt &&
              !(refreshTokens[index].expiresAt < where.expiresAt.lt)
            ) {
              continue;
            }

            refreshTokens.splice(index, 1);
            count += 1;
          }

          return { count };
        },
      ),
      count: jest.fn(
        async ({
          where,
        }: {
          where?: {
            tenantId?: string;
            revokedAt?: null;
            expiresAt?: { gt: Date };
          };
        }) => {
          return refreshTokens.filter((candidate) => {
            if (where?.tenantId && candidate.tenantId !== where.tenantId) {
              return false;
            }

            if (where?.revokedAt === null && candidate.revokedAt !== null) {
              return false;
            }

            if (
              where?.expiresAt?.gt &&
              !(candidate.expiresAt > where.expiresAt.gt)
            ) {
              return false;
            }

            return true;
          }).length;
        },
      ),
    },
    apiKey: {
      findUnique: jest.fn(
        async ({
          where,
          include,
        }: {
          where: { keyHash: string };
          include?: { tenant?: boolean };
        }) => {
          const apiKey =
            apiKeys.find((candidate) => candidate.keyHash === where.keyHash) ??
            null;

          if (!apiKey) {
            return null;
          }

          if (include?.tenant) {
            const tenant = tenants.find(
              (candidate) => candidate.id === apiKey.tenantId,
            );
            return tenant ? { ...apiKey, tenant } : null;
          }

          return apiKey;
        },
      ),
      create: jest.fn(
        async ({
          data,
        }: {
          data: {
            tenantId: string;
            name: string;
            prefix: string;
            keyHash: string;
            scope: ApiKeyScope;
          };
        }) => {
          const now = new Date();
          const apiKey: MockApiKey = {
            id: `api-key-${apiKeyCounter++}`,
            tenantId: data.tenantId,
            name: data.name,
            prefix: data.prefix,
            keyHash: data.keyHash,
            scope: data.scope,
            lastUsedAt: null,
            expiresAt: null,
            revokedAt: null,
            createdAt: now,
            updatedAt: now,
          };

          apiKeys.push(apiKey);
          return apiKey;
        },
      ),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<MockApiKey>;
        }) => {
          const apiKey = apiKeys.find((candidate) => candidate.id === where.id);
          if (!apiKey) {
            throw new Error('API key not found');
          }

          Object.assign(apiKey, data, { updatedAt: new Date() });
          return apiKey;
        },
      ),
      count: jest.fn(
        async ({
          where,
        }: {
          where?: { tenantId?: string; revokedAt?: null };
        }) => {
          return apiKeys.filter((candidate) => {
            if (where?.tenantId && candidate.tenantId !== where.tenantId) {
              return false;
            }

            if (where?.revokedAt === null && candidate.revokedAt !== null) {
              return false;
            }

            return true;
          }).length;
        },
      ),
      deleteMany: jest.fn(
        async ({ where }: { where?: { expiresAt?: { lt?: Date } } }) => {
          let count = 0;

          for (let index = apiKeys.length - 1; index >= 0; index -= 1) {
            if (
              where?.expiresAt?.lt &&
              !(
                apiKeys[index].expiresAt !== null &&
                apiKeys[index].expiresAt! < where.expiresAt.lt
              )
            ) {
              continue;
            }

            apiKeys.splice(index, 1);
            count += 1;
          }

          return { count };
        },
      ),
    },
    contact: {
      count: jest.fn(async ({ where }: { where?: Record<string, unknown> }) => {
        return contacts.filter((candidate) =>
          matchesContactWhere(candidate, where),
        ).length;
      }),
      findMany: jest.fn(
        async ({
          where,
          select,
        }: {
          where?: Record<string, unknown>;
          select?: SelectMap;
        }) => {
          const filtered = contacts.filter((candidate) =>
            matchesContactWhere(candidate, where),
          );

          if (!select) {
            return filtered;
          }

          return filtered.map((contact) =>
            pickSelected(contact as Record<string, unknown>, select),
          );
        },
      ),
    },
    segment: {
      findFirst: jest.fn(
        async ({
          where,
          include,
        }: {
          where?: { id?: string; tenantId?: string; name?: string };
          include?: { _count?: { select?: { members?: boolean } } };
        }) => {
          const segment =
            segments.find((candidate) => {
              if (where?.id && candidate.id !== where.id) {
                return false;
              }

              if (where?.tenantId && candidate.tenantId !== where.tenantId) {
                return false;
              }

              if (where?.name && candidate.name !== where.name) {
                return false;
              }

              return true;
            }) ?? null;

          if (!segment) {
            return null;
          }

          if (include?._count?.select?.members) {
            return {
              ...segment,
              _count: {
                members: segmentMembers.filter(
                  (candidate) => candidate.segmentId === segment.id,
                ).length,
              },
            };
          }

          return segment;
        },
      ),
      findMany: jest.fn(
        async ({
          where,
          orderBy,
          select,
        }: {
          where?: { tenantId?: string };
          orderBy?: { createdAt: 'asc' | 'desc' };
          select?: SelectMap;
        }) => {
          const filtered = segments.filter((candidate) => {
            if (where?.tenantId && candidate.tenantId !== where.tenantId) {
              return false;
            }

            return true;
          });

          filtered.sort((left, right) =>
            orderBy?.createdAt === 'desc'
              ? right.createdAt.getTime() - left.createdAt.getTime()
              : left.createdAt.getTime() - right.createdAt.getTime(),
          );

          if (!select) {
            return filtered;
          }

          return filtered.map((segment) =>
            pickSelected(segment as Record<string, unknown>, select),
          );
        },
      ),
      create: jest.fn(
        async ({
          data,
        }: {
          data: {
            tenantId: string;
            name: string;
            description?: string | null;
            type: SegmentType;
            conditions: unknown;
          };
        }) => {
          const now = new Date();
          const segment: MockSegment = {
            id: `segment-${segmentCounter++}`,
            tenantId: data.tenantId,
            name: data.name,
            description: data.description ?? null,
            type: data.type,
            conditions: data.conditions,
            contactCount: 0,
            lastSyncAt: null,
            createdAt: now,
            updatedAt: now,
          };

          segments.push(segment);
          return segment;
        },
      ),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<MockSegment>;
        }) => {
          const segment = segments.find(
            (candidate) => candidate.id === where.id,
          );
          if (!segment) {
            throw new Error('Segment not found');
          }

          Object.assign(segment, data, { updatedAt: new Date() });
          return segment;
        },
      ),
      delete: jest.fn(async ({ where }: { where: { id: string } }) => {
        const index = segments.findIndex(
          (candidate) => candidate.id === where.id,
        );
        if (index === -1) {
          throw new Error('Segment not found');
        }

        const [segment] = segments.splice(index, 1);

        for (
          let currentIndex = segmentMembers.length - 1;
          currentIndex >= 0;
          currentIndex -= 1
        ) {
          if (segmentMembers[currentIndex].segmentId === segment.id) {
            segmentMembers.splice(currentIndex, 1);
          }
        }

        return segment;
      }),
    },
    segmentMember: {
      deleteMany: jest.fn(
        async ({ where }: { where: { segmentId?: string } }) => {
          let count = 0;

          for (let index = segmentMembers.length - 1; index >= 0; index -= 1) {
            if (
              where.segmentId === undefined ||
              segmentMembers[index].segmentId === where.segmentId
            ) {
              segmentMembers.splice(index, 1);
              count += 1;
            }
          }

          return { count };
        },
      ),
      createMany: jest.fn(
        async ({
          data,
          skipDuplicates,
        }: {
          data: Array<{ segmentId: string; contactId: string }>;
          skipDuplicates?: boolean;
        }) => {
          let count = 0;

          for (const item of data) {
            const exists = segmentMembers.some(
              (candidate) =>
                candidate.segmentId === item.segmentId &&
                candidate.contactId === item.contactId,
            );

            if (exists && skipDuplicates) {
              continue;
            }

            segmentMembers.push({
              segmentId: item.segmentId,
              contactId: item.contactId,
              addedAt: new Date(),
            });
            count += 1;
          }

          return { count };
        },
      ),
      findMany: jest.fn(
        async ({
          where,
          skip,
          take,
          orderBy,
          include,
        }: {
          where?: { segmentId?: string };
          skip?: number;
          take?: number;
          orderBy?: { addedAt: 'asc' | 'desc' };
          include?: { contact?: { select: SelectMap } };
        }) => {
          const filtered = segmentMembers.filter((candidate) => {
            if (where?.segmentId && candidate.segmentId !== where.segmentId) {
              return false;
            }

            return true;
          });

          filtered.sort((left, right) =>
            orderBy?.addedAt === 'asc'
              ? left.addedAt.getTime() - right.addedAt.getTime()
              : right.addedAt.getTime() - left.addedAt.getTime(),
          );

          const sliced = filtered.slice(
            skip ?? 0,
            (skip ?? 0) + (take ?? filtered.length),
          );

          if (!include?.contact) {
            return sliced;
          }

          return sliced.map((item) => {
            const contact = contacts.find(
              (candidate) => candidate.id === item.contactId,
            );

            return {
              ...item,
              contact: contact
                ? pickSelected(
                    contact as Record<string, unknown>,
                    include.contact!.select,
                  )
                : null,
            };
          });
        },
      ),
      count: jest.fn(async ({ where }: { where?: { segmentId?: string } }) => {
        return segmentMembers.filter((candidate) => {
          if (where?.segmentId && candidate.segmentId !== where.segmentId) {
            return false;
          }

          return true;
        }).length;
      }),
    },
    adAudience: {
      upsert: jest.fn(
        async ({
          where,
          update,
          create,
        }: {
          where: { tenantId_name: { tenantId: string; name: string } };
          update: { memberCount?: number; lastSyncAt?: Date | null };
          create: {
            tenantId: string;
            adCampaignId?: string | null;
            segmentId?: string | null;
            externalId?: string | null;
            name: string;
            memberCount?: number;
            lastSyncAt?: Date | null;
          };
        }) => {
          const existing = adAudiences.find(
            (candidate) =>
              candidate.tenantId === where.tenantId_name.tenantId &&
              candidate.name === where.tenantId_name.name,
          );

          if (existing) {
            if (update.memberCount !== undefined) {
              existing.memberCount = update.memberCount;
            }

            if (update.lastSyncAt !== undefined) {
              existing.lastSyncAt = update.lastSyncAt;
            }

            return existing;
          }

          const audience: MockAdAudience = {
            id: `audience-${adAudienceCounter++}`,
            tenantId: create.tenantId,
            adCampaignId: create.adCampaignId ?? null,
            segmentId: create.segmentId ?? null,
            externalId: create.externalId ?? null,
            name: create.name,
            memberCount: create.memberCount ?? 0,
            lastSyncAt: create.lastSyncAt ?? null,
            createdAt: new Date(),
          };

          adAudiences.push(audience);
          return audience;
        },
      ),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { memberCount?: number; lastSyncAt?: Date | null };
        }) => {
          const audience = adAudiences.find(
            (candidate) => candidate.id === where.id,
          );

          if (!audience) {
            throw new Error('Ad audience not found');
          }

          if (data.memberCount !== undefined) {
            audience.memberCount = data.memberCount;
          }

          if (data.lastSyncAt !== undefined) {
            audience.lastSyncAt = data.lastSyncAt;
          }

          return audience;
        },
      ),
    },
    adAudienceMember: {
      deleteMany: jest.fn(
        async ({ where }: { where?: { audienceId?: string } }) => {
          let count = 0;

          for (
            let index = adAudienceMembers.length - 1;
            index >= 0;
            index -= 1
          ) {
            if (
              where?.audienceId === undefined ||
              adAudienceMembers[index].audienceId === where.audienceId
            ) {
              adAudienceMembers.splice(index, 1);
              count += 1;
            }
          }

          return { count };
        },
      ),
      createMany: jest.fn(
        async ({
          data,
          skipDuplicates,
        }: {
          data: Array<{ audienceId: string; contactId: string }>;
          skipDuplicates?: boolean;
        }) => {
          let count = 0;

          for (const item of data) {
            const exists = adAudienceMembers.some(
              (candidate) =>
                candidate.audienceId === item.audienceId &&
                candidate.contactId === item.contactId,
            );

            if (exists && skipDuplicates) {
              continue;
            }

            adAudienceMembers.push({
              audienceId: item.audienceId,
              contactId: item.contactId,
              addedAt: new Date(),
            });
            count += 1;
          }

          return { count };
        },
      ),
    },
    $transaction: async <T>(
      input: Promise<unknown>[] | ((tx: typeof prismaMock) => Promise<T>),
    ): Promise<T | unknown[]> => {
      if (Array.isArray(input)) {
        return Promise.all(input);
      }

      return input(prismaMock);
    },
  };

  return prismaMock;
};

export const toCookieHeader = (setCookie: string[] | undefined): string[] => {
  return (setCookie ?? []).map((cookie) => cookie.split(';')[0]);
};
