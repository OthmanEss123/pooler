import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { QueryPostsDto } from './dto/query-posts.dto';

type WordPressPostRecord = {
  id: string;
  externalId: string;
  title: string;
  url: string;
  publishedAt: Date | null;
  rawPayload: Prisma.JsonValue | null;
};

type PostApiResponse = {
  id: string;
  externalId: string;
  title: string;
  slug: string | null;
  url: string;
  publishedAt: Date | null;
  contentHtml: string | null;
};

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, query: QueryPostsDto) {
    const [posts, total] = await this.prisma.$transaction([
      this.prisma.wordPressPost.findMany({
        where: { tenantId },
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.wordPressPost.count({
        where: { tenantId },
      }),
    ]);

    return {
      data: posts.map((post) => this.toApiResponse(post)),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async findOne(tenantId: string, id: string) {
    const post = await this.prisma.wordPressPost.findFirst({
      where: { tenantId, id },
    });

    if (!post) {
      throw new NotFoundException(`Post ${id} introuvable`);
    }

    return this.toApiResponse(post);
  }

  private toApiResponse(post: WordPressPostRecord): PostApiResponse {
    const payload = this.asRecord(post.rawPayload);
    const content = this.asRecord(payload.content);

    return {
      id: post.id,
      externalId: post.externalId,
      title: post.title,
      slug: this.readString(payload.slug),
      url: post.url,
      publishedAt: post.publishedAt,
      contentHtml: this.readString(content.rendered),
    };
  }

  private asRecord(
    value: Prisma.JsonValue | null | unknown,
  ): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
  }

  private readString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
  }
}
