/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-base-to-string */
import { OrderStatus } from '@prisma/client';
import { createPrismaMock } from './create-prisma-mock';

type CommerceContact = {
  id: string;
  tenantId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  emailStatus: string;
  totalRevenue: number;
  totalOrders: number;
  firstOrderAt: Date | null;
  lastOrderAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type CommerceOrder = {
  id: string;
  contactId: string;
  externalId: string | null;
  orderNumber: string | null;
  status: OrderStatus;
  totalAmount: number;
  subtotal: number | null;
  currency: string;
  placedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

type CommerceOrderItem = {
  id: string;
  orderId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  createdAt: Date;
  updatedAt: Date;
};

const normalizeSearch = (value: string) => value.trim().toLowerCase();

export const createCommercePrismaMock = () => {
  const prismaMock = createPrismaMock() as any;
  const contacts: CommerceContact[] = [];
  const orders: CommerceOrder[] = [];
  const orderItems: CommerceOrderItem[] = [];

  let contactCounter = 1;
  let orderCounter = 1;
  let orderItemCounter = 1;

  const attachOrderItems = (order: CommerceOrder) => ({
    ...order,
    items: orderItems.filter((item) => item.orderId === order.id),
  });

  const findContact = (where?: Record<string, unknown>) => {
    return (
      contacts.find((contact) => {
        if (where?.id && contact.id !== where.id) {
          return false;
        }

        if (where?.tenantId && contact.tenantId !== where.tenantId) {
          return false;
        }

        if (
          where?.email &&
          contact.email !== normalizeSearch(String(where.email))
        ) {
          return false;
        }

        if (where?.OR && Array.isArray(where.OR)) {
          const matches = (where.OR as Record<string, unknown>[]).some(
            (clause) => {
              if (clause.email && typeof clause.email === 'object') {
                const contains = normalizeSearch(
                  String(
                    (clause.email as { contains?: string }).contains ?? '',
                  ),
                );
                return contact.email.includes(contains);
              }

              if (clause.firstName && typeof clause.firstName === 'object') {
                const contains = normalizeSearch(
                  String(
                    (clause.firstName as { contains?: string }).contains ?? '',
                  ),
                );
                return (contact.firstName ?? '')
                  .toLowerCase()
                  .includes(contains);
              }

              if (clause.lastName && typeof clause.lastName === 'object') {
                const contains = normalizeSearch(
                  String(
                    (clause.lastName as { contains?: string }).contains ?? '',
                  ),
                );
                return (contact.lastName ?? '')
                  .toLowerCase()
                  .includes(contains);
              }

              return false;
            },
          );

          if (!matches) {
            return false;
          }
        }

        return true;
      }) ?? null
    );
  };

  prismaMock.contact.findFirst = jest.fn(
    async ({ where, include }: any = {}) => {
      const contact = findContact(where);
      if (!contact) {
        return null;
      }

      if (!include) {
        return contact;
      }

      return {
        ...contact,
        orders: include.orders
          ? orders
              .filter((order) => order.contactId === contact.id)
              .sort(
                (left, right) =>
                  right.placedAt.getTime() - left.placedAt.getTime(),
              )
              .map((order) => attachOrderItems(order))
          : undefined,
        segmentMembers: include.segmentMembers ? [] : undefined,
      };
    },
  );

  prismaMock.contact.findMany = jest.fn(
    async ({ where, skip, take, orderBy }: any = {}) => {
      const filtered = contacts.filter((contact) => {
        return findContact({ ...where, id: contact.id }) !== null;
      });

      filtered.sort((left, right) =>
        orderBy?.createdAt === 'desc'
          ? right.createdAt.getTime() - left.createdAt.getTime()
          : left.createdAt.getTime() - right.createdAt.getTime(),
      );

      const start = skip ?? 0;
      const end = take === undefined ? filtered.length : start + take;
      return filtered.slice(start, end);
    },
  );

  prismaMock.contact.count = jest.fn(async ({ where }: any = {}) => {
    return contacts.filter(
      (contact) => findContact({ ...where, id: contact.id }) !== null,
    ).length;
  });

  prismaMock.contact.create = jest.fn(async ({ data }: any) => {
    const now = new Date();
    const contact: CommerceContact = {
      id: `commerce-contact-${contactCounter++}`,
      tenantId: data.tenantId,
      email: normalizeSearch(String(data.email)),
      firstName: data.firstName ?? null,
      lastName: data.lastName ?? null,
      phone: data.phone ?? null,
      emailStatus: data.emailStatus ?? 'PENDING',
      totalRevenue: Number(data.totalRevenue ?? 0),
      totalOrders: Number(data.totalOrders ?? 0),
      firstOrderAt: data.firstOrderAt ?? null,
      lastOrderAt: data.lastOrderAt ?? null,
      createdAt: now,
      updatedAt: now,
    };

    contacts.push(contact);
    return contact;
  });

  prismaMock.contact.update = jest.fn(async ({ where, data }: any) => {
    const contact = contacts.find((candidate) => candidate.id === where.id);
    if (!contact) {
      throw new Error('Contact not found');
    }

    Object.assign(contact, {
      ...data,
      email: data.email ? normalizeSearch(String(data.email)) : contact.email,
      totalRevenue:
        data.totalRevenue === undefined
          ? contact.totalRevenue
          : Number(data.totalRevenue),
      updatedAt: new Date(),
    });
    return contact;
  });

  prismaMock.contact.delete = jest.fn(async ({ where }: any) => {
    const index = contacts.findIndex((candidate) => candidate.id === where.id);
    if (index === -1) {
      throw new Error('Contact not found');
    }

    const [contact] = contacts.splice(index, 1);

    for (
      let currentIndex = orders.length - 1;
      currentIndex >= 0;
      currentIndex -= 1
    ) {
      if (orders[currentIndex].contactId === contact.id) {
        const orderId = orders[currentIndex].id;
        orders.splice(currentIndex, 1);

        for (
          let itemIndex = orderItems.length - 1;
          itemIndex >= 0;
          itemIndex -= 1
        ) {
          if (orderItems[itemIndex].orderId === orderId) {
            orderItems.splice(itemIndex, 1);
          }
        }
      }
    }

    return contact;
  });

  prismaMock.contact.deleteMany = jest.fn(async ({ where }: any = {}) => {
    let count = 0;

    for (let index = contacts.length - 1; index >= 0; index -= 1) {
      if (where?.tenantId && contacts[index].tenantId !== where.tenantId) {
        continue;
      }

      contacts.splice(index, 1);
      count += 1;
    }

    return { count };
  });

  prismaMock.order = {
    create: jest.fn(async ({ data }: any) => {
      const now = new Date();
      const order: CommerceOrder = {
        id: `commerce-order-${orderCounter++}`,
        contactId: data.contactId,
        externalId: data.externalId ?? null,
        orderNumber: data.orderNumber ?? null,
        status: data.status,
        totalAmount: Number(data.totalAmount),
        subtotal:
          data.subtotal === null || data.subtotal === undefined
            ? null
            : Number(data.subtotal),
        currency: data.currency,
        placedAt: new Date(data.placedAt),
        createdAt: now,
        updatedAt: now,
      };

      orders.push(order);
      return order;
    }),
    findMany: jest.fn(
      async ({ where, include, select, orderBy, skip, take }: any = {}) => {
        const filtered = orders.filter((order) => {
          const contact = contacts.find(
            (candidate) => candidate.id === order.contactId,
          );
          if (!contact) {
            return false;
          }

          if (where?.contactId && order.contactId !== where.contactId) {
            return false;
          }

          if (
            where?.contact?.tenantId &&
            contact.tenantId !== where.contact.tenantId
          ) {
            return false;
          }

          if (where?.status) {
            if (
              typeof where.status === 'string' &&
              order.status !== where.status
            ) {
              return false;
            }

            if (
              typeof where.status === 'object' &&
              Array.isArray(where.status.in)
            ) {
              if (!(where.status.in as string[]).includes(order.status)) {
                return false;
              }
            }
          }

          return true;
        });

        filtered.sort((left, right) =>
          orderBy?.placedAt === 'asc'
            ? left.placedAt.getTime() - right.placedAt.getTime()
            : right.placedAt.getTime() - left.placedAt.getTime(),
        );

        const start = skip ?? 0;
        const end = take === undefined ? filtered.length : start + take;
        const sliced = filtered.slice(start, end);

        if (select) {
          return sliced.map((order) => ({
            totalAmount: order.totalAmount,
            placedAt: order.placedAt,
          }));
        }

        if (!include?.items) {
          return sliced;
        }

        return sliced.map((order) => attachOrderItems(order));
      },
    ),
    findFirst: jest.fn(async ({ where, include, select }: any = {}) => {
      const order =
        orders.find((candidate) => {
          const contact = contacts.find(
            (contactItem) => contactItem.id === candidate.contactId,
          );
          if (!contact) {
            return false;
          }

          if (where?.id && candidate.id !== where.id) {
            return false;
          }

          if (
            where?.contact?.tenantId &&
            contact.tenantId !== where.contact.tenantId
          ) {
            return false;
          }

          return true;
        }) ?? null;

      if (!order) {
        return null;
      }

      if (select) {
        return {
          id: order.id,
          contactId: order.contactId,
        };
      }

      if (include?.items) {
        return attachOrderItems(order);
      }

      return order;
    }),
    update: jest.fn(async ({ where, data, include }: any) => {
      const order = orders.find((candidate) => candidate.id === where.id);
      if (!order) {
        throw new Error('Order not found');
      }

      Object.assign(order, { ...data, updatedAt: new Date() });

      if (include?.items) {
        return attachOrderItems(order);
      }

      return order;
    }),
    count: jest.fn(async ({ where }: any = {}) => {
      const filtered = await prismaMock.order.findMany({ where });
      return filtered.length;
    }),
  };

  prismaMock.orderItem = {
    createMany: jest.fn(async ({ data }: any) => {
      for (const item of data) {
        orderItems.push({
          id: `commerce-order-item-${orderItemCounter++}`,
          orderId: item.orderId,
          name: item.name,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          totalPrice: Number(item.totalPrice),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      return { count: data.length };
    }),
  };

  return prismaMock;
};
