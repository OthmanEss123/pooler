/**
 * Fixtures Google Ads API pour les tests de contrat.
 *
 * Ces objets reproduisent les payloads renvoyes par
 * https://googleads.googleapis.com/v22 (search / mutate / oauth).
 */

export const googleAdsTokenResponse = {
  access_token: 'ya29.test-access-token',
  expires_in: 3599,
  token_type: 'Bearer',
  scope: 'https://www.googleapis.com/auth/adwords',
};

export const googleAdsSearchResponse = {
  results: [
    {
      campaign: {
        resourceName: 'customers/1234567890/campaigns/9876543210',
        id: '9876543210',
        name: 'Brand - Search FR',
        status: 'ENABLED',
        advertisingChannelType: 'SEARCH',
      },
      campaignBudget: {
        amountMicros: '50000000',
      },
      metrics: {
        costMicros: '12500000',
        impressions: '15234',
        clicks: '821',
        conversions: '23.5',
        conversionsValue: '1875.45',
      },
    },
    {
      campaign: {
        resourceName: 'customers/1234567890/campaigns/9876543211',
        id: '9876543211',
        name: 'Performance Max - Promo',
        status: 'PAUSED',
        advertisingChannelType: 'PERFORMANCE_MAX',
      },
      campaignBudget: {
        amountMicros: '75000000',
      },
      metrics: {
        costMicros: '0',
        impressions: '0',
        clicks: '0',
        conversions: '0',
        conversionsValue: '0',
      },
    },
  ],
};

export const googleAdsMutateResponse = {
  results: [
    {
      resourceName: 'customers/1234567890/campaigns/9876543210',
    },
  ],
};

export const googleAdsCreateBudgetResponse = {
  results: [
    {
      resourceName: 'customers/1234567890/campaignBudgets/12345',
    },
  ],
};

export const googleAdsCreateCampaignResponse = {
  results: [
    {
      resourceName: 'customers/1234567890/campaigns/55555',
    },
  ],
};

export const googleAdsCreateAdGroupResponse = {
  results: [
    {
      resourceName: 'customers/1234567890/adGroups/77777',
    },
  ],
};

export const googleAdsErrorResponse = {
  error: {
    code: 400,
    message: 'Request contains an invalid argument.',
    status: 'INVALID_ARGUMENT',
    details: [
      {
        '@type':
          'type.googleapis.com/google.ads.googleads.v22.errors.GoogleAdsFailure',
        errors: [
          {
            errorCode: { campaignError: 'DUPLICATE_CAMPAIGN_NAME' },
            message: 'Campaign name already exists.',
          },
        ],
      },
    ],
  },
};

export const googleAdsRateLimitResponse = {
  error: {
    code: 429,
    message: 'Resource has been exhausted (e.g. check quota).',
    status: 'RESOURCE_EXHAUSTED',
  },
};

/**
 * Fabrique un objet `Response`-like accepte par notre client en remplacant
 * `global.fetch` dans les tests.
 */
export function buildFetchResponse(
  body: unknown,
  init?: { status?: number; headers?: Record<string, string> },
) {
  const status = init?.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => init?.headers?.[name.toLowerCase()] ?? null,
    },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}
