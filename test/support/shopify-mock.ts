/**
 * Fixtures Shopify Admin API pour les tests de contrat.
 *
 * Reproduit https://shopdomain.myshopify.com/admin/api/2024-01/orders.json
 * et /products.json.
 */

export const shopifyOrdersResponse = {
  orders: [
    {
      id: 5544332211,
      name: '#1042',
      order_number: 1042,
      email: 'jane.doe@example.com',
      financial_status: 'paid',
      currency: 'EUR',
      total_price: '125.50',
      subtotal_price: '110.00',
      created_at: '2026-03-18T10:24:00Z',
      customer: {
        id: 998877,
        email: 'jane.doe@example.com',
        first_name: 'Jane',
        last_name: 'Doe',
      },
      line_items: [
        {
          id: 11111,
          product_id: 22222,
          name: 'T-Shirt - L',
          sku: 'TSHIRT-L-001',
          quantity: 2,
          price: '45.00',
        },
        {
          id: 11112,
          product_id: 22223,
          name: 'Tote Bag',
          sku: 'BAG-001',
          quantity: 1,
          price: '20.00',
        },
      ],
    },
    {
      id: 5544332212,
      name: '#1043',
      order_number: 1043,
      email: '',
      financial_status: 'refunded',
      currency: 'EUR',
      total_price: '0.00',
      subtotal_price: '0.00',
      created_at: '2026-03-18T11:00:00Z',
      customer: null,
      line_items: [],
    },
  ],
};

export const shopifyProductsResponse = {
  products: [
    {
      id: 22222,
      title: 'T-Shirt Premium',
      product_type: 'Apparel',
      status: 'active',
      tags: 'cotton, summer, hero',
      variants: [
        {
          id: 33331,
          sku: 'TSHIRT-L-001',
          price: '45.00',
          inventory_quantity: 12,
          inventory_policy: 'deny',
        },
      ],
      image: {
        src: 'https://cdn.shopify.com/s/files/1/0001/products/tshirt.jpg',
      },
    },
    {
      id: 22223,
      title: 'Tote Bag',
      product_type: 'Accessories',
      status: 'draft',
      tags: '',
      variants: [
        {
          id: 33341,
          sku: 'BAG-001',
          price: '20.00',
          inventory_quantity: null,
          inventory_policy: 'continue',
        },
      ],
      image: null,
    },
  ],
};

export const shopifyRateLimitResponse = {
  errors: 'Throttled',
};

export const shopifyOAuthTokenResponse = {
  access_token: 'shpat_test_access_token_xxxx',
  scope: 'read_products,write_products,read_orders',
};

/**
 * Generates the OAuth callback URL with a valid HMAC signature, useful when
 * testing /oauth/callback handlers.
 */
export function shopifyCallbackQuery(params: {
  shop: string;
  state: string;
  code?: string;
}) {
  return {
    code: params.code ?? 'test-auth-code',
    shop: params.shop,
    state: params.state,
    timestamp: String(Math.floor(Date.now() / 1000)),
  };
}
