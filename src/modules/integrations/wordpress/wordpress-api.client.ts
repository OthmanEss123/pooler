import { BadRequestException, Injectable, Logger } from '@nestjs/common';

export type WordPressCredentials = {
  consumerKey: string;
  consumerSecret: string;
};

export interface WordPressUser {
  id?: number | string;
  email?: string;
  name?: string;
  roles?: string[];
}

export interface WordPressPostPayload {
  id?: number | string;
  title?: {
    rendered?: string;
  };
  link?: string;
  date?: string;
  categories?: Array<number | string>;
}

@Injectable()
export class WordPressApiClient {
  private readonly logger = new Logger(WordPressApiClient.name);

  async testConnection(
    siteUrl: string,
    credentials: WordPressCredentials,
  ): Promise<void> {
    const response = await this.request(
      `${this.normalizeSiteUrl(siteUrl)}/wp-json/wp/v2/users/me`,
      credentials,
    );

    if (response.status === 401) {
      throw new BadRequestException('Credentials WordPress invalides');
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new BadRequestException(
        `Connexion WordPress impossible: ${errorText || String(response.status)}`,
      );
    }
  }

  async getUsers(
    siteUrl: string,
    credentials: WordPressCredentials,
    page: number,
  ): Promise<WordPressUser[]> {
    const response = await this.request(
      `${this.normalizeSiteUrl(siteUrl)}/wp-json/wp/v2/users?per_page=100&page=${page}`,
      credentials,
    );

    return this.parseArrayResponse<WordPressUser>(response, 'utilisateurs');
  }

  async getPosts(
    siteUrl: string,
    credentials: WordPressCredentials,
    page: number,
  ): Promise<WordPressPostPayload[]> {
    const response = await this.request(
      `${this.normalizeSiteUrl(siteUrl)}/wp-json/wp/v2/posts?per_page=100&page=${page}&status=publish`,
      credentials,
    );

    return this.parseArrayResponse<WordPressPostPayload>(response, 'articles');
  }

  private async parseArrayResponse<T>(
    response: Response,
    resource: string,
  ): Promise<T[]> {
    if (response.status === 401) {
      throw new BadRequestException('Credentials WordPress invalides');
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new BadRequestException(
        `Erreur WordPress ${resource}: ${errorText || String(response.status)}`,
      );
    }

    const payload = (await response.json()) as unknown;
    return Array.isArray(payload) ? (payload as T[]) : [];
  }

  private async request(
    url: string,
    credentials: WordPressCredentials,
    retries = 3,
  ): Promise<Response> {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: this.buildBasicAuthHeader(
          credentials.consumerKey,
          credentials.consumerSecret,
        ),
        Accept: 'application/json',
      },
    });

    if (response.status === 429 && retries > 0) {
      this.logger.warn(
        `WordPress 429 sur ${url} - retry dans 2s (${retries} restants)`,
      );
      await this.sleep(2000);
      return this.request(url, credentials, retries - 1);
    }

    return response;
  }

  private buildBasicAuthHeader(consumerKey: string, consumerSecret: string) {
    const encoded = Buffer.from(`${consumerKey}:${consumerSecret}`).toString(
      'base64',
    );

    return `Basic ${encoded}`;
  }

  private normalizeSiteUrl(siteUrl: string) {
    return siteUrl.replace(/\/+$/, '');
  }

  private async sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
