/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unnecessary-type-assertion */
import {
  EmailEventType,
  EmailStatus,
  SuppressionReason,
  UserRole,
} from '@prisma/client';

import { createPrismaMock } from './create-prisma-mock';

type SelectMap = Record<string, boolean | { select: SelectMap }>;

interface ExtendedUser extends Record<string, unknown> {
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
  emailVerified: boolean;
  verifyToken: string | null;
  verifyTokenExpiry: Date | null;
}

interface ExtendedContact extends Record<string, unknown> {
  id: string;
  tenantId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  emailStatus: EmailStatus;
  subscribed: boolean;
  unsubscribedAt: Date | null;
  bouncedAt: Date | null;
  complainedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface GlobalSuppressionRecord {
  id: string;
  tenantId: string;
  email: string;
  reason: SuppressionReason;
  createdAt: Date;
}

interface InvitationTokenRecord {
  id: string;
  tenantId: string;
  email: string;
  role: UserRole;
  token: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

interface EmailEventRecord {
  id: string;
  tenantId: string;
  campaignId: string | null;
  contactId: string | null;
  email: string | null;
  type: EmailEventType;
  provider: string | null;
  metadata: unknown;
  createdAt: Date;
}

interface ComplianceStores {
  users: Map<string, ExtendedUser>;
  contacts: Map<string, ExtendedContact>;
  globalSuppressions: GlobalSuppressionRecord[];
  invitationTokens: InvitationTokenRecord[];
  emailEvents: EmailEventRecord[];
}

export interface CompliancePrismaMock extends ReturnType<
  typeof createPrismaMock
> {
  __stores: ComplianceStores;
}

const pickSelected = (
  source: Record<string, unknown>,
  select: SelectMap,
): Record<string, unknown> => {
  return Object.fromEntries(
    Object.entries(select)
      .filter(([, value]) => value)
      .map(([key, value]) => {
        if (typeof value === 'object' && value !== null && 'select' in value) {
          const relation = source[key] as
            | Record<string, unknown>
            | null
            | undefined;
          return [
            key,
            relation ? pickSelected(relation, value.select as SelectMap) : null,
          ];
        }

        return [key, source[key]];
      }),
  );
};

const matchesContactWhere = (
  contact: ExtendedContact,
  where?: Record<string, unknown>,
): boolean => {
  if (!where) {
    return true;
  }

  if (where.id && contact.id !== where.id) {
    return false;
  }

  if (where.tenantId && contact.tenantId !== where.tenantId) {
    return false;
  }

  if (
    typeof where.email === 'string' &&
    contact.email.toLowerCase() !== where.email.toLowerCase()
  ) {
    return false;
  }

  if (where.emailStatus && contact.emailStatus !== where.emailStatus) {
    return false;
  }

  return true;
};

export const createCompliancePrismaMock = (): CompliancePrismaMock => {
  const prismaMock = createPrismaMock() as CompliancePrismaMock;

  const userDelegate = prismaMock.user as Record<string, jest.Mock>;
  const tenantDelegate = prismaMock.tenant as Record<string, jest.Mock>;
  const contactDelegate = prismaMock.contact as Record<string, jest.Mock>;

  const rawUserFindUnique = userDelegate.findUnique;
  const rawUserCreate = userDelegate.create;
  const rawUserUpdate = userDelegate.update;
  const rawContactFindMany = contactDelegate.findMany;

  const users = new Map<string, ExtendedUser>();
  const contacts = new Map<string, ExtendedContact>();
  const globalSuppressions: GlobalSuppressionRecord[] = [];
  const invitationTokens: InvitationTokenRecord[] = [];
  const emailEvents: EmailEventRecord[] = [];

  let suppressionCounter = 1;
  let invitationCounter = 1;
  let emailEventCounter = 1;

  const normalizeUser = (source: Record<string, unknown>): ExtendedUser => {
    const userId = String(source.id);
    const previous = users.get(userId);
    const normalized: ExtendedUser = {
      ...source,
      id: userId,
      tenantId: String(source.tenantId),
      email: String(source.email),
      passwordHash: String(source.passwordHash),
      firstName: (source.firstName as string | null | undefined) ?? null,
      lastName: (source.lastName as string | null | undefined) ?? null,
      role: (source.role as UserRole | undefined) ?? UserRole.MEMBER,
      isActive: source.isActive !== false,
      lastLoginAt: (source.lastLoginAt as Date | null | undefined) ?? null,
      createdAt: (source.createdAt as Date | undefined) ?? new Date(),
      updatedAt: (source.updatedAt as Date | undefined) ?? new Date(),
      emailVerified:
        (source.emailVerified as boolean | undefined) ??
        previous?.emailVerified ??
        false,
      verifyToken:
        'verifyToken' in source
          ? (source.verifyToken as string | null)
          : (previous?.verifyToken ?? null),
      verifyTokenExpiry:
        'verifyTokenExpiry' in source
          ? (source.verifyTokenExpiry as Date | null)
          : (previous?.verifyTokenExpiry ?? null),
    };

    users.set(userId, normalized);
    return normalized;
  };

  const getAllContacts = async (): Promise<ExtendedContact[]> => {
    const baseContacts = (await rawContactFindMany({})) as Record<
      string,
      unknown
    >[];

    return baseContacts.map((source) => {
      const contactId = String(source.id);
      const previous = contacts.get(contactId);
      const normalized: ExtendedContact = {
        ...source,
        id: contactId,
        tenantId: String(source.tenantId),
        email: String(source.email),
        firstName: (source.firstName as string | null | undefined) ?? null,
        lastName: (source.lastName as string | null | undefined) ?? null,
        phone: (source.phone as string | null | undefined) ?? null,
        emailStatus:
          (source.emailStatus as EmailStatus | undefined) ??
          previous?.emailStatus ??
          EmailStatus.SUBSCRIBED,
        subscribed:
          (source.subscribed as boolean | undefined) ??
          previous?.subscribed ??
          true,
        unsubscribedAt:
          (source.unsubscribedAt as Date | null | undefined) ??
          previous?.unsubscribedAt ??
          null,
        bouncedAt:
          (source.bouncedAt as Date | null | undefined) ??
          previous?.bouncedAt ??
          null,
        complainedAt:
          (source.complainedAt as Date | null | undefined) ??
          previous?.complainedAt ??
          null,
        createdAt: (source.createdAt as Date | undefined) ?? new Date(),
        updatedAt: (source.updatedAt as Date | undefined) ?? new Date(),
      };

      contacts.set(contactId, normalized);
      return normalized;
    });
  };

  userDelegate.create = jest.fn(
    async ({ data }: { data: Record<string, unknown> }) => {
      const created = (await rawUserCreate({ data })) as Record<
        string,
        unknown
      >;
      return normalizeUser(created);
    },
  );

  userDelegate.update = jest.fn(
    async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => {
      const current = (await rawUserFindUnique({ where })) as Record<
        string,
        unknown
      > | null;
      if (!current) {
        throw new Error('User not found');
      }

      await rawUserUpdate({ where, data });

      return normalizeUser({
        ...current,
        ...data,
        updatedAt: new Date(),
      });
    },
  );

  userDelegate.findUnique = jest.fn(
    async ({
      where,
      include,
      select,
    }: {
      where: { id?: string; email?: string };
      include?: { tenant?: boolean };
      select?: SelectMap;
    }) => {
      const baseUser = (await rawUserFindUnique({ where })) as Record<
        string,
        unknown
      > | null;
      if (!baseUser) {
        return null;
      }

      const normalized = normalizeUser(baseUser);
      const tenant = (await tenantDelegate.findUnique({
        where: { id: normalized.tenantId },
      })) as Record<string, unknown> | null;

      if (include?.tenant) {
        return {
          ...normalized,
          tenant,
        };
      }

      if (select) {
        return pickSelected(
          {
            ...normalized,
            tenant,
          },
          select,
        );
      }

      return normalized;
    },
  );

  userDelegate.findFirst = jest.fn(
    async ({ where }: { where?: Record<string, unknown> }) => {
      const candidates = Array.from(users.values());

      return (
        candidates.find((candidate) => {
          if (!where) {
            return true;
          }

          if (where.id && candidate.id !== where.id) {
            return false;
          }

          if (where.email && candidate.email !== where.email) {
            return false;
          }

          if (
            where.verifyToken &&
            candidate.verifyToken !== where.verifyToken
          ) {
            return false;
          }

          return true;
        }) ?? null
      );
    },
  );

  contactDelegate.findMany = jest.fn(
    async ({
      where,
      select,
    }: {
      where?: Record<string, unknown>;
      select?: SelectMap;
    } = {}) => {
      const filtered = (await getAllContacts()).filter((contact) =>
        matchesContactWhere(contact, where),
      );

      if (!select) {
        return filtered;
      }

      return filtered.map((contact) => pickSelected(contact, select));
    },
  );

  contactDelegate.findFirst = jest.fn(
    async ({
      where,
      select,
    }: {
      where?: Record<string, unknown>;
      select?: SelectMap;
    } = {}) => {
      const matches = (await contactDelegate.findMany({
        where,
        select,
      })) as Array<Record<string, unknown>>;
      return matches[0] ?? null;
    },
  );

  contactDelegate.update = jest.fn(
    async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => {
      const existing = (await getAllContacts()).find(
        (contact) => contact.id === where.id,
      );

      if (!existing) {
        throw new Error('Contact not found');
      }

      const updated: ExtendedContact = {
        ...existing,
        ...data,
        updatedAt: new Date(),
      };

      contacts.set(updated.id, updated);
      return updated;
    },
  );

  prismaMock.globalSuppression = {
    findUnique: jest.fn(
      async ({
        where,
      }: {
        where: { tenantId_email: { tenantId: string; email: string } };
      }) => {
        const normalizedEmail = where.tenantId_email.email.toLowerCase();
        return (
          globalSuppressions.find(
            (candidate) =>
              candidate.tenantId === where.tenantId_email.tenantId &&
              candidate.email === normalizedEmail,
          ) ?? null
        );
      },
    ),
    upsert: jest.fn(
      async ({
        where,
        update,
        create,
      }: {
        where: { tenantId_email: { tenantId: string; email: string } };
        update: Partial<GlobalSuppressionRecord>;
        create: Omit<GlobalSuppressionRecord, 'id' | 'createdAt'>;
      }) => {
        const normalizedEmail = where.tenantId_email.email.toLowerCase();
        const existing = globalSuppressions.find(
          (candidate) =>
            candidate.tenantId === where.tenantId_email.tenantId &&
            candidate.email === normalizedEmail,
        );

        if (existing) {
          Object.assign(existing, update);
          return existing;
        }

        const createdRecord: GlobalSuppressionRecord = {
          id: `suppression-${suppressionCounter++}`,
          tenantId: create.tenantId,
          email: create.email.toLowerCase(),
          reason: create.reason,
          createdAt: new Date(),
        };

        globalSuppressions.push(createdRecord);
        return createdRecord;
      },
    ),
    findMany: jest.fn(
      async ({
        where,
        orderBy,
        take,
        skip,
      }: {
        where?: { tenantId?: string };
        orderBy?: { createdAt: 'asc' | 'desc' };
        take?: number;
        skip?: number;
      } = {}) => {
        const filtered = globalSuppressions.filter((candidate) => {
          if (where?.tenantId && candidate.tenantId !== where.tenantId) {
            return false;
          }

          return true;
        });

        filtered.sort((left, right) =>
          orderBy?.createdAt === 'asc'
            ? left.createdAt.getTime() - right.createdAt.getTime()
            : right.createdAt.getTime() - left.createdAt.getTime(),
        );

        return filtered.slice(
          skip ?? 0,
          (skip ?? 0) + (take ?? filtered.length),
        );
      },
    ),
    count: jest.fn(
      async ({ where }: { where?: { tenantId?: string } } = {}) => {
        return globalSuppressions.filter((candidate) => {
          if (where?.tenantId && candidate.tenantId !== where.tenantId) {
            return false;
          }

          return true;
        }).length;
      },
    ),
    delete: jest.fn(
      async ({
        where,
      }: {
        where: { tenantId_email: { tenantId: string; email: string } };
      }) => {
        const normalizedEmail = where.tenantId_email.email.toLowerCase();
        const index = globalSuppressions.findIndex(
          (candidate) =>
            candidate.tenantId === where.tenantId_email.tenantId &&
            candidate.email === normalizedEmail,
        );

        if (index === -1) {
          throw new Error('Global suppression not found');
        }

        const [deleted] = globalSuppressions.splice(index, 1);
        return deleted;
      },
    ),
  };

  prismaMock.invitationToken = {
    findUnique: jest.fn(
      async ({
        where,
        include,
      }: {
        where: { id?: string; token?: string };
        include?: { tenant?: boolean };
      }) => {
        const invitation =
          invitationTokens.find((candidate) => {
            if (where.id) {
              return candidate.id === where.id;
            }

            if (where.token) {
              return candidate.token === where.token;
            }

            return false;
          }) ?? null;

        if (!invitation) {
          return null;
        }

        if (include?.tenant) {
          const tenant = (await tenantDelegate.findUnique({
            where: { id: invitation.tenantId },
          })) as Record<string, unknown> | null;

          return {
            ...invitation,
            tenant,
          };
        }

        return invitation;
      },
    ),
    findFirst: jest.fn(
      async ({
        where,
        orderBy,
      }: {
        where?: Record<string, unknown>;
        orderBy?: { createdAt: 'asc' | 'desc' };
      } = {}) => {
        const filtered = invitationTokens.filter((candidate) => {
          if (!where) {
            return true;
          }

          if (where.id && candidate.id !== where.id) {
            return false;
          }

          if (where.tenantId && candidate.tenantId !== where.tenantId) {
            return false;
          }

          if (
            typeof where.email === 'string' &&
            candidate.email !== where.email.toLowerCase()
          ) {
            return false;
          }

          if (where.usedAt === null && candidate.usedAt !== null) {
            return false;
          }

          if (
            where.expiresAt &&
            typeof where.expiresAt === 'object' &&
            'gt' in where.expiresAt
          ) {
            const expiresAfter = (where.expiresAt as { gt: Date }).gt;
            if (!(candidate.expiresAt > expiresAfter)) {
              return false;
            }
          }

          return true;
        });

        filtered.sort((left, right) =>
          orderBy?.createdAt === 'asc'
            ? left.createdAt.getTime() - right.createdAt.getTime()
            : right.createdAt.getTime() - left.createdAt.getTime(),
        );

        return filtered[0] ?? null;
      },
    ),
    findMany: jest.fn(
      async ({
        where,
        orderBy,
      }: {
        where?: { tenantId?: string };
        orderBy?: { createdAt: 'asc' | 'desc' };
      } = {}) => {
        const filtered = invitationTokens.filter((candidate) => {
          if (where?.tenantId && candidate.tenantId !== where.tenantId) {
            return false;
          }

          return true;
        });

        filtered.sort((left, right) =>
          orderBy?.createdAt === 'asc'
            ? left.createdAt.getTime() - right.createdAt.getTime()
            : right.createdAt.getTime() - left.createdAt.getTime(),
        );

        return filtered;
      },
    ),
    create: jest.fn(
      async ({
        data,
      }: {
        data: Omit<InvitationTokenRecord, 'id' | 'createdAt' | 'usedAt'> & {
          usedAt?: Date | null;
        };
      }) => {
        const invitation: InvitationTokenRecord = {
          id: `invitation-${invitationCounter++}`,
          tenantId: data.tenantId,
          email: data.email.toLowerCase(),
          role: data.role,
          token: data.token,
          expiresAt: data.expiresAt,
          usedAt: data.usedAt ?? null,
          createdAt: new Date(),
        };

        invitationTokens.push(invitation);
        return invitation;
      },
    ),
    update: jest.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<InvitationTokenRecord>;
      }) => {
        const invitation = invitationTokens.find(
          (candidate) => candidate.id === where.id,
        );

        if (!invitation) {
          throw new Error('Invitation not found');
        }

        Object.assign(invitation, data);
        return invitation;
      },
    ),
    delete: jest.fn(async ({ where }: { where: { id: string } }) => {
      const index = invitationTokens.findIndex(
        (candidate) => candidate.id === where.id,
      );

      if (index === -1) {
        throw new Error('Invitation not found');
      }

      const [deleted] = invitationTokens.splice(index, 1);
      return deleted;
    }),
  };

  prismaMock.emailEvent = {
    count: jest.fn(async () => emailEvents.length),
    findFirst: jest.fn(
      async ({
        where,
        orderBy,
        select,
      }: {
        where?: Record<string, unknown>;
        orderBy?: { createdAt: 'asc' | 'desc' };
        select?: SelectMap;
      } = {}) => {
        const filtered = emailEvents.filter((candidate) => {
          if (!where) {
            return true;
          }

          if (where.tenantId && candidate.tenantId !== where.tenantId) {
            return false;
          }

          if (where.contactId && candidate.contactId !== where.contactId) {
            return false;
          }

          if (where.type && candidate.type !== where.type) {
            return false;
          }

          if (
            where.createdAt &&
            typeof where.createdAt === 'object' &&
            'gte' in where.createdAt
          ) {
            const since = (where.createdAt as { gte: Date }).gte;
            if (candidate.createdAt < since) {
              return false;
            }
          }

          return true;
        });

        filtered.sort((left, right) =>
          orderBy?.createdAt === 'asc'
            ? left.createdAt.getTime() - right.createdAt.getTime()
            : right.createdAt.getTime() - left.createdAt.getTime(),
        );

        const event = filtered[0] ?? null;
        if (!event) {
          return null;
        }

        if (select) {
          return pickSelected(
            event as unknown as Record<string, unknown>,
            select,
          );
        }

        return event;
      },
    ),
    create: jest.fn(
      async ({
        data,
      }: {
        data: Omit<EmailEventRecord, 'id' | 'createdAt'>;
      }) => {
        const event: EmailEventRecord = {
          id: `email-event-${emailEventCounter++}`,
          tenantId: data.tenantId,
          campaignId: data.campaignId,
          contactId: data.contactId,
          email: data.email,
          type: data.type,
          provider: data.provider,
          metadata: data.metadata,
          createdAt: new Date(),
        };

        emailEvents.push(event);
        return event;
      },
    ),
  };

  prismaMock.__stores = {
    users,
    contacts,
    globalSuppressions,
    invitationTokens,
    emailEvents,
  };

  return prismaMock;
};
