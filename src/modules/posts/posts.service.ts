import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.wordPressPost.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
