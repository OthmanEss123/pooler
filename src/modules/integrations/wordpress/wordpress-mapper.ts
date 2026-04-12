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

    return {
      email: typeof wpUser.email === 'string' ? wpUser.email : null,
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
