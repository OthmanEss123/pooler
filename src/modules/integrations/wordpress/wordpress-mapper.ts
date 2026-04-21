import { Injectable } from '@nestjs/common';
import type {
  WordPressPostPayload,
  WordPressUser,
} from './wordpress-api.client';

export type MappedWordPressContact = {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  sourceChannel: 'wordpress';
  properties: {
    wpUserId: string | null;
    wpRoles: string[];
  };
};

export type MappedWordPressPost = {
  externalId: string;
  title: string;
  url: string;
  publishedAt: string | null;
  category: string | null;
};

@Injectable()
export class WordPressMapper {
  mapUserToContact(wpUser: WordPressUser): MappedWordPressContact {
    const nameParts = (wpUser.name ?? '')
      .split(/\s+/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    const fallbackEmail = this.buildFallbackEmail(wpUser);

    return {
      email:
        typeof wpUser.email === 'string' && wpUser.email.trim().length > 0
          ? wpUser.email
          : fallbackEmail,
      firstName: nameParts[0] ?? null,
      lastName: nameParts.length > 1 ? nameParts.slice(1).join(' ') : null,
      sourceChannel: 'wordpress',
      properties: {
        wpUserId:
          wpUser.id === undefined || wpUser.id === null
            ? null
            : String(wpUser.id),
        wpRoles: Array.isArray(wpUser.roles) ? wpUser.roles : [],
      },
    };
  }

  private buildFallbackEmail(wpUser: WordPressUser): string | null {
    const candidate = [wpUser.slug, wpUser.username, wpUser.name]
      .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
      ?.trim()
      .toLowerCase();

    const localPart = candidate
      ?.replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (localPart && localPart.length > 0) {
      return `${localPart}@wordpress.local`;
    }

    if (wpUser.id !== undefined && wpUser.id !== null) {
      return `wp-user-${String(wpUser.id).toLowerCase()}@wordpress.local`;
    }

    return null;
  }

  mapPost(wpPost: WordPressPostPayload): MappedWordPressPost {
    const firstCategory = Array.isArray(wpPost.categories)
      ? wpPost.categories[0]
      : null;

    return {
      externalId:
        wpPost.id === undefined || wpPost.id === null ? '' : String(wpPost.id),
      title: wpPost.title?.rendered ?? '',
      url: wpPost.link ?? '',
      publishedAt: wpPost.date ?? null,
      category:
        firstCategory === undefined || firstCategory === null
          ? null
          : String(firstCategory),
    };
  }
}
