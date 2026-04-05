import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type GoogleAdsSearchResponse<T> = {
  results?: T[];
};

type GoogleAdsMutateResponse = {
  results?: Array<{ resourceName: string }>;
};

@Injectable()
export class GoogleAdsApiClient {
  constructor(private readonly config: ConfigService) {}

  async getAccessToken(refreshToken: string): Promise<string> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
        client_secret: this.config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      }),
    });

    if (!response.ok) {
      throw new BadRequestException('Google OAuth refresh failed');
    }

    const data = (await response.json()) as { access_token: string };
    return data.access_token;
  }

  async search<T>(
    customerId: string,
    accessToken: string,
    query: string,
  ): Promise<T[]> {
    const response = await this.request(
      customerId,
      accessToken,
      'googleAds:search',
      { query },
    );

    const data = (await response.json()) as GoogleAdsSearchResponse<T>;
    return data.results ?? [];
  }

  async mutate(
    customerId: string,
    accessToken: string,
    operations: Record<string, unknown>[],
  ): Promise<GoogleAdsMutateResponse> {
    const response = await this.request(
      customerId,
      accessToken,
      'googleAds:mutate',
      { mutateOperations: operations },
    );

    return (await response.json()) as GoogleAdsMutateResponse;
  }

  private async request(
    customerId: string,
    accessToken: string,
    endpoint: string,
    body: Record<string, unknown>,
    retries = 3,
  ): Promise<Response> {
    const apiVersion = this.config.get<string>('GOOGLE_ADS_API_VERSION', 'v22');
    const loginCustomerId = this.config.get<string>(
      'GOOGLE_ADS_LOGIN_CUSTOMER_ID',
    );

    const response = await fetch(
      `https://googleads.googleapis.com/${apiVersion}/customers/${customerId}/${endpoint}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'developer-token': this.config.getOrThrow<string>(
            'GOOGLE_ADS_DEVELOPER_TOKEN',
          ),
          'Content-Type': 'application/json',
          ...(loginCustomerId ? { 'login-customer-id': loginCustomerId } : {}),
        },
        body: JSON.stringify(body),
      },
    );

    if (response.status === 429 && retries > 0) {
      const retryAfter = Number.parseInt(
        response.headers.get('Retry-After') ?? '2',
        10,
      );

      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      return this.request(customerId, accessToken, endpoint, body, retries - 1);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new BadRequestException(
        `Google Ads API ${response.status}: ${errorText}`,
      );
    }

    return response;
  }
}
