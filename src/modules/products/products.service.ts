import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InsightType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateProductStockDto } from './dto/update-product-stock.dto';

type PrismaLike = PrismaService | Prisma.TransactionClient;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateProductDto) {
    const exists = await this.prisma.product.findUnique({
      where: {
        tenantId_externalId: { tenantId, externalId: dto.externalId },
      },
    });

    if (exists) {
      throw new ConflictException(
        `Product with externalId ${dto.externalId} already exists`,
      );
    }

    return this.prisma.product.create({
      data: { tenantId, ...dto },
    });
  }

  async findAll(tenantId: string, query: QueryProductsDto) {
    const where: Prisma.ProductWhereInput = { tenantId, isActive: true };

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { sku: { contains: query.search, mode: 'insensitive' } },
        { category: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.category) {
      where.category = query.category;
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        take: query.limit,
        skip: query.offset,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);

    return { data, total, limit: query.limit, offset: query.offset };
  }

  async findLowStock(tenantId: string) {
    const products = await this.prisma.product.findMany({
      where: {
        tenantId,
        isActive: true,
        trackStock: true,
        stockQuantity: { not: null },
        lowStockAlert: { not: null },
      },
      orderBy: [{ stockQuantity: 'asc' }, { createdAt: 'desc' }],
    });

    return products.filter(
      (product) =>
        product.stockQuantity !== null &&
        product.lowStockAlert !== null &&
        product.stockQuantity <= product.lowStockAlert,
    );
  }

  async findOne(tenantId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId, isActive: true },
    });

    if (!product) {
      throw new NotFoundException(`Produit ${id} introuvable`);
    }

    return product;
  }

  async update(tenantId: string, id: string, dto: UpdateProductDto) {
    await this.findOne(tenantId, id);
    return this.prisma.product.update({ where: { id }, data: dto });
  }

  async updateStock(tenantId: string, id: string, dto: UpdateProductStockDto) {
    await this.findOne(tenantId, id);

    const product = await this.prisma.product.update({
      where: { id },
      data: {
        stockQuantity: dto.stockQuantity,
        lowStockAlert: dto.lowStockAlert,
        ...(dto.trackStock === undefined ? {} : { trackStock: dto.trackStock }),
      },
    });

    await this.createLowStockInsightIfNeeded(tenantId, product, this.prisma);

    return product;
  }

  async decrementStock(
    tenantId: string,
    productId: string,
    quantity: number,
    client: PrismaLike = this.prisma,
  ) {
    const product = await client.product.findFirst({
      where: { id: productId, tenantId, isActive: true },
    });

    if (!product) {
      throw new NotFoundException(`Produit ${productId} introuvable`);
    }

    if (!product.trackStock) {
      return product;
    }

    const nextQuantity = Math.max((product.stockQuantity ?? 0) - quantity, 0);

    const updated = await client.product.update({
      where: { id: product.id },
      data: { stockQuantity: nextQuantity },
    });

    await this.createLowStockInsightIfNeeded(tenantId, updated, client);

    return updated;
  }

  async restoreStock(
    tenantId: string,
    productId: string,
    quantity: number,
    client: PrismaLike = this.prisma,
  ) {
    const product = await client.product.findFirst({
      where: { id: productId, tenantId },
    });

    if (!product || !product.trackStock) {
      return product;
    }

    return client.product.update({
      where: { id: product.id },
      data: {
        stockQuantity: (product.stockQuantity ?? 0) + quantity,
      },
    });
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.findOne(tenantId, id);
    await this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async upsertByExternalId(tenantId: string, dto: CreateProductDto) {
    return this.prisma.product.upsert({
      where: {
        tenantId_externalId: { tenantId, externalId: dto.externalId },
      },
      update: dto,
      create: { tenantId, ...dto },
    });
  }

  private async createLowStockInsightIfNeeded(
    tenantId: string,
    product: {
      id: string;
      name: string;
      sku: string | null;
      stockQuantity: number | null;
      lowStockAlert: number | null;
      trackStock: boolean;
    },
    client: PrismaLike,
  ) {
    if (
      !product.trackStock ||
      product.stockQuantity === null ||
      product.lowStockAlert === null ||
      product.stockQuantity > product.lowStockAlert
    ) {
      return;
    }

    const title = `Stock faible - ${product.name}`;
    const recentThreshold = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const existing = await client.insight.findFirst({
      where: {
        tenantId,
        type: InsightType.ANOMALY,
        createdAt: { gte: recentThreshold },
        data: {
          path: ['productId'],
          equals: product.id,
        },
      },
    });

    if (existing) {
      return;
    }

    await client.insight.create({
      data: {
        tenantId,
        type: InsightType.ANOMALY,
        title,
        description: `${product.stockQuantity} units remaining (threshold: ${product.lowStockAlert}).`,
        data: {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          stockQuantity: product.stockQuantity,
          threshold: product.lowStockAlert,
        },
      },
    });
  }
}
