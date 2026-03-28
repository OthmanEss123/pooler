import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';

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
}
