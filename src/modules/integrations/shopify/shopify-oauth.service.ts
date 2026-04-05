import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { RedisService } from '../../../redis/redis.service';
import { ShopifyService } from './shopify.service';

@Injectable()
export class ShopifyOAuthService {
  private readonly logger = new Logger(ShopifyOAuthService.name);
  private readonly NONCE_TTL = 600; // 10 minutes

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly shopify: ShopifyService,
  ) {}

  async getOAuthUrl(shop: string, tenantId: string) {
    const nonce = randomBytes(16).toString('hex');
    const scopes = [
      'read_orders',
      'write_orders',
      'read_products',
      'write_products',
      'read_customers',
      'write_customers',
    ].join(',');
    const redirectUri = this.config.getOrThrow<string>('SHOPIFY_REDIRECT_URI');
    const apiKey = this.config.getOrThrow<string>('SHOPIFY_API_KEY');

    // Stocker nonce → tenantId + shop (usage unique)
    await this.redis.set(
      `shopify:oauth:${nonce}`,
      JSON.stringify({ tenantId, shop }),
      this.NONCE_TTL,
    );

    const url =
      `https://${shop}/admin/oauth/authorize` +
      `?client_id=${apiKey}` +
      `&scope=${scopes}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${nonce}`;

    return { url };
  }

  async handleCallback(shop: string, code: string, state: string) {
    // Lire et supprimer nonce (usage unique)
    const stored = await this.redis.get(`shopify:oauth:${state}`);
    if (!stored) {
      throw new BadRequestException('State invalide ou expire');
    }

    await this.redis.del(`shopify:oauth:${state}`);
    const { tenantId } = JSON.parse(stored) as {
      tenantId: string;
      shop: string;
    };

    // Échanger code → access token
    const accessToken = await this.exchangeCode(shop, code);

    // Connecter + lancer sync initiale
    await this.shopify.connect(tenantId, shop, accessToken);
    return { connected: true, shop, tenantId };
  }

  private async exchangeCode(shop: string, code: string) {
    const apiKey = this.config.getOrThrow<string>('SHOPIFY_API_KEY');
    const apiSecret = this.config.getOrThrow<string>('SHOPIFY_API_SECRET');

    const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: apiKey,
        client_secret: apiSecret,
        code,
      }),
    });

    if (!res.ok) {
      throw new BadRequestException('Echange code Shopify echoue');
    }

    const data = (await res.json()) as { access_token: string };
    return data.access_token;
  }
}
