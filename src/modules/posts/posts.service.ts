import { Injectable, NotFoundException } from '@nestjs/common';
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

  async findOne(tenantId: string, id: string) {
    const posts = await this.prisma.wordPressPost.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });

    const post = posts.find((candidate) => candidate.id === id);

    if (!post) {
      throw new NotFoundException(`Post ${id} introuvable`);
    }

    return post;
  }
}
