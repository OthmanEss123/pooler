import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const GRAPH_VERSION = 'v19.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

@Injectable()
export class FacebookAdsApiClient {
  private readonly logger = new Logger(FacebookAdsApiClient.name);

  constructor(private readonly config: ConfigService) {}

  async exchangeCodeForShortToken(
    code: string,
    redirectUri: string,
  ): Promise<{ access_token: string; expires_in?: number }> {
    const clientId = this.config.get<string>('FACEBOOK_APP_ID');
    const clientSecret = this.config.get<string>('FACEBOOK_APP_SECRET');

    if (!clientId || !clientSecret) {
      throw new BadRequestException('Facebook app non configurée');
    }

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    });

    const res = await fetch(`${GRAPH_BASE}/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new BadRequestException(`Facebook OAuth: ${text}`);
    }

    return (await res.json()) as { access_token: string; expires_in?: number };
  }

  async getLongLivedToken(shortToken: string): Promise<{
    access_token: string;
    expires_in?: number;
  }> {
    const clientId = this.config.get<string>('FACEBOOK_APP_ID');
    const clientSecret = this.config.get<string>('FACEBOOK_APP_SECRET');

    if (!clientId || !clientSecret) {
      throw new BadRequestException('Facebook app non configurée');
    }

    const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
    url.searchParams.set('grant_type', 'fb_exchange_token');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('client_secret', clientSecret);
    url.searchParams.set('fb_exchange_token', shortToken);

    const res = await fetch(url.toString());

    if (!res.ok) {
      const text = await res.text();
      throw new BadRequestException(`Facebook token exchange: ${text}`);
    }

    return (await res.json()) as {
      access_token: string;
      expires_in?: number;
    };
  }

  async get<T>(
    path: string,
    accessToken: string,
    params: Record<string, string> = {},
    retries = 3,
  ): Promise<T> {
    const url = new URL(`${GRAPH_BASE}/${path.replace(/^\//, '')}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
    url.searchParams.set('access_token', accessToken);

    const res = await fetch(url.toString());

    if (res.status === 429 && retries > 0) {
      const retryAfter = Number.parseInt(
        res.headers.get('Retry-After') ?? '2',
        10,
      );
      this.logger.warn(`Facebook Graph 429, retry in ${retryAfter}s`);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      return this.get<T>(path, accessToken, params, retries - 1);
    }

    if (!res.ok) {
      const text = await res.text();
      throw new BadRequestException(`Facebook Graph GET ${path}: ${text}`);
    }

    return (await res.json()) as T;
  }

  async post<T>(
    path: string,
    accessToken: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const url = new URL(`${GRAPH_BASE}/${path.replace(/^\//, '')}`);
    url.searchParams.set('access_token', accessToken);

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new BadRequestException(`Facebook Graph POST ${path}: ${text}`);
    }

    return (await res.json()) as T;
  }

  /**
   * Suit les liens paging.next jusqu'à épuisement (limite de sécurité).
   */
  async getAllPages<Item = Record<string, unknown>>(
    path: string,
    accessToken: string,
    params: Record<string, string> = {},
    maxPages = 50,
  ): Promise<Item[]> {
    type Page = { data?: Item[]; paging?: { next?: string } };
    const out: Item[] = [];
    let nextUrl: string | null = null;
    let page = 0;

    const first = await this.get<Page>(path, accessToken, params);
    if (Array.isArray(first.data)) {
      out.push(...first.data);
    }

    nextUrl = first.paging?.next ?? null;

    while (nextUrl && page < maxPages) {
      page += 1;
      const res = await fetch(nextUrl);
      if (!res.ok) {
        break;
      }
      const chunk = (await res.json()) as Page;
      if (Array.isArray(chunk.data)) {
        out.push(...chunk.data);
      }
      nextUrl = chunk.paging?.next ?? null;
    }

    return out;
  }
}
