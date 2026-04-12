import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import { OrdersService } from './orders.service';

type PrismaMock = {
  product: {
    findFirst: jest.Mock;
  };
  order: {
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    findUnique: jest.Mock;
  };
  orderItem: {
    createMany: jest.Mock;
    deleteMany: jest.Mock;
  };
  contact: {
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  $transaction: jest.Mock;
};

type ProductsMock = {
  decrementStock: jest.Mock;
  restoreStock: jest.Mock;
};

const mockPrisma: PrismaMock = {
  product: {
    findFirst: jest.fn(),
  },
  order: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
  },
  orderItem: {
    createMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  contact: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockProducts: ProductsMock = {
  decrementStock: jest.fn(),
  restoreStock: jest.fn(),
};

describe('OrdersService', () => {
  let service: OrdersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ProductsService, useValue: mockProducts },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      (callback: (tx: PrismaMock) => unknown) =>
        Promise.resolve(callback(mockPrisma)),
    );
  });

  describe('create()', () => {
    it('decrements stock for each item with productId', async () => {
      mockPrisma.contact.findFirst.mockResolvedValue({
        id: 'contact-1',
        email: 'buyer@test.com',
      });
      mockPrisma.product.findFirst.mockResolvedValue({
        id: 'prod-1',
        externalId: 'ext-prod-1',
      });
      mockPrisma.order.create.mockResolvedValue({ id: 'order-1' });
      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.contact.update.mockResolvedValue({});
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'order-1',
        contactId: 'contact-1',
        status: OrderStatus.PENDING,
        items: [{ productId: 'prod-1', quantity: 2 }],
      });

      await service.create('tenant-1', {
        contactEmail: 'buyer@test.com',
        externalId: 'ext-1',
        orderNumber: '#001',
        status: OrderStatus.PENDING,
        totalAmount: 59.98,
        subtotal: 59.98,
        currency: 'EUR',
        source: 'manual',
        placedAt: new Date().toISOString(),
        items: [
          {
            productId: 'prod-1',
            quantity: 2,
            name: 'Produit',
            unitPrice: 29.99,
            totalPrice: 59.98,
          },
        ],
      });

      expect(mockProducts.decrementStock).toHaveBeenCalledWith(
        'tenant-1',
        'prod-1',
        2,
        mockPrisma,
      );
    });

    it('does not decrement stock without productId', async () => {
      mockPrisma.contact.findFirst.mockResolvedValue({
        id: 'contact-1',
        email: 'buyer@test.com',
      });
      mockPrisma.order.create.mockResolvedValue({ id: 'order-2' });
      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.contact.update.mockResolvedValue({});
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'order-2',
        contactId: 'contact-1',
        status: OrderStatus.PENDING,
        items: [{ productId: null, quantity: 1 }],
      });

      await service.create('tenant-1', {
        contactEmail: 'buyer@test.com',
        externalId: 'ext-2',
        orderNumber: '#002',
        status: OrderStatus.PENDING,
        totalAmount: 10,
        subtotal: 10,
        currency: 'EUR',
        source: 'manual',
        placedAt: new Date().toISOString(),
        items: [
          {
            quantity: 1,
            name: 'Produit',
            unitPrice: 10,
            totalPrice: 10,
          },
        ],
      });

      expect(mockProducts.decrementStock).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus()', () => {
    it('restores stock on PAID -> CANCELLED', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'order-1',
        contactId: 'contact-1',
        status: OrderStatus.PAID,
        items: [{ productId: 'prod-1', quantity: 3 }],
      });
      mockPrisma.order.update.mockResolvedValue({
        id: 'order-1',
        contactId: 'contact-1',
        status: OrderStatus.CANCELLED,
        items: [{ productId: 'prod-1', quantity: 3 }],
      });
      mockPrisma.order.findMany.mockResolvedValue([
        {
          totalAmount: new Prisma.Decimal(0),
          placedAt: new Date(),
        },
      ]);
      mockPrisma.contact.update.mockResolvedValue({});

      await service.updateStatus('tenant-1', 'order-1', OrderStatus.CANCELLED);

      expect(mockProducts.restoreStock).toHaveBeenCalledWith(
        'tenant-1',
        'prod-1',
        3,
        mockPrisma,
      );
    });

    it('does not restore stock on CANCELLED -> CANCELLED', async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        id: 'order-1',
        contactId: 'contact-1',
        status: OrderStatus.CANCELLED,
        items: [{ productId: 'prod-1', quantity: 3 }],
      });
      mockPrisma.order.update.mockResolvedValue({
        id: 'order-1',
        contactId: 'contact-1',
        status: OrderStatus.CANCELLED,
        items: [{ productId: 'prod-1', quantity: 3 }],
      });
      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.contact.update.mockResolvedValue({});

      await service.updateStatus('tenant-1', 'order-1', OrderStatus.CANCELLED);

      expect(mockProducts.restoreStock).not.toHaveBeenCalled();
    });
  });
});
