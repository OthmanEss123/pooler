import { Test, TestingModule } from '@nestjs/testing';
import { InsightType } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ProductsService } from './products.service';

type PrismaMock = {
  product: {
    findFirst: jest.Mock;
    update: jest.Mock;
    findMany: jest.Mock;
  };
  insight: {
    findFirst: jest.Mock;
    create: jest.Mock;
  };
};

const mockPrisma: PrismaMock = {
  product: {
    findFirst: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
  insight: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
};

describe('ProductsService', () => {
  let service: ProductsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
    jest.clearAllMocks();
  });

  describe('decrementStock()', () => {
    it('skips when trackStock is false', async () => {
      mockPrisma.product.findFirst.mockResolvedValue({
        id: 'p1',
        tenantId: 'tenant-1',
        trackStock: false,
        stockQuantity: 10,
      });

      await service.decrementStock('tenant-1', 'p1', 2);

      expect(mockPrisma.product.update).not.toHaveBeenCalled();
    });

    it('decrements when trackStock is true', async () => {
      mockPrisma.product.findFirst.mockResolvedValue({
        id: 'p1',
        tenantId: 'tenant-1',
        trackStock: true,
        stockQuantity: 10,
        lowStockAlert: 3,
        name: 'Produit',
        sku: 'SKU-1',
      });
      mockPrisma.product.update.mockResolvedValue({
        id: 'p1',
        tenantId: 'tenant-1',
        trackStock: true,
        stockQuantity: 7,
        lowStockAlert: 3,
        name: 'Produit',
        sku: 'SKU-1',
      });
      mockPrisma.insight.findFirst.mockResolvedValue(null);

      await service.decrementStock('tenant-1', 'p1', 3);

      expect(mockPrisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { stockQuantity: 7 },
        }),
      );
    });

    it('creates an insight when stock falls below threshold', async () => {
      mockPrisma.product.findFirst.mockResolvedValue({
        id: 'p1',
        tenantId: 'tenant-1',
        name: 'Produit',
        sku: 'SKU-1',
        trackStock: true,
        stockQuantity: 4,
        lowStockAlert: 5,
      });
      mockPrisma.product.update.mockResolvedValue({
        id: 'p1',
        tenantId: 'tenant-1',
        name: 'Produit',
        sku: 'SKU-1',
        trackStock: true,
        stockQuantity: 2,
        lowStockAlert: 5,
      });
      mockPrisma.insight.findFirst.mockResolvedValue(null);

      await service.decrementStock('tenant-1', 'p1', 2);

      expect(mockPrisma.insight.create).toHaveBeenCalled();
      const [createArgs] = mockPrisma.insight.create.mock.calls[0] as [
        { data: { type: InsightType } },
      ];
      expect(createArgs.data.type).toBe(InsightType.ANOMALY);
    });

    it('deduplicates low stock alert by productId', async () => {
      mockPrisma.product.findFirst.mockResolvedValue({
        id: 'p1',
        tenantId: 'tenant-1',
        name: 'Produit',
        sku: 'SKU-1',
        trackStock: true,
        stockQuantity: 2,
        lowStockAlert: 5,
      });
      mockPrisma.product.update.mockResolvedValue({
        id: 'p1',
        tenantId: 'tenant-1',
        name: 'Produit',
        sku: 'SKU-1',
        trackStock: true,
        stockQuantity: 1,
        lowStockAlert: 5,
      });
      mockPrisma.insight.findFirst.mockResolvedValue({ id: 'existing' });

      await service.decrementStock('tenant-1', 'p1', 1);

      expect(mockPrisma.insight.create).not.toHaveBeenCalled();
    });
  });

  describe('findLowStock()', () => {
    it('returns only products at or below the threshold', async () => {
      mockPrisma.product.findMany.mockResolvedValue([
        { id: 'p1', trackStock: true, stockQuantity: 2, lowStockAlert: 5 },
        { id: 'p2', trackStock: true, stockQuantity: 10, lowStockAlert: 5 },
        { id: 'p3', trackStock: true, stockQuantity: 5, lowStockAlert: 5 },
      ]);

      const result = (await service.findLowStock('tenant-1')) as Array<{
        id: string;
      }>;

      expect(result.map((product) => product.id)).toEqual(['p1', 'p3']);
    });
  });
});
