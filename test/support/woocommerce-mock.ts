/**
 * Fixtures WooCommerce REST API v3 + webhooks pour les tests de contrat.
 */
import { createHmac } from 'crypto';

export const woocommerceOrdersResponse = [
  {
    id: 7777,
    number: '7777',
    status: 'processing',
    currency: 'EUR',
    total: '89.90',
    date_created: '2026-03-22T09:13:42',
    billing: {
      email: 'pierre.martin@example.com',
      first_name: 'Pierre',
      last_name: 'Martin',
      phone: '+33102030405',
    },
    line_items: [
      {
        id: 8888,
        product_id: 121,
        name: 'Sweat Capuche',
        sku: 'HOODIE-001',
        quantity: 1,
        price: '69.90',
        total: '69.90',
      },
      {
        id: 8889,
        product_id: 122,
        name: 'Casquette',
        sku: 'CAP-001',
        quantity: 1,
        price: '20.00',
        total: '20.00',
      },
    ],
  },
  {
    id: 7778,
    number: '7778',
    status: 'completed',
    currency: 'EUR',
    total: '149.00',
    date_created: '2026-03-22T10:00:00',
    billing: {
      email: 'sophie.lopez@example.com',
      first_name: 'Sophie',
      last_name: 'Lopez',
    },
    line_items: [
      {
        id: 8890,
        product_id: 123,
        name: 'Veste Hiver',
        sku: 'JACKET-001',
        quantity: 1,
        price: '149.00',
        total: '149.00',
      },
    ],
  },
];

export const woocommerceProductsResponse = [
  {
    id: 121,
    name: 'Sweat Capuche',
    sku: 'HOODIE-001',
    price: '69.90',
    status: 'publish',
    stock_quantity: 25,
    manage_stock: 'true',
    images: [
      {
        src: 'https://example.com/wp-content/uploads/hoodie.jpg',
      },
    ],
    categories: [{ name: 'Vetements' }],
    tags: [{ name: 'hiver' }, { name: 'unisexe' }],
  },
  {
    id: 122,
    name: 'Casquette',
    sku: 'CAP-001',
    price: '20.00',
    status: 'publish',
    stock_quantity: null,
    manage_stock: 'false',
    images: [],
    categories: [{ name: 'Accessoires' }],
    tags: [],
  },
];

/**
 * Calcule la signature HMAC-SHA256 (base64) telle qu'envoyee par WooCommerce
 * dans l'header `X-WC-Webhook-Signature`.
 */
export function buildWooSignature(body: string | Buffer, secret: string) {
  const buffer = typeof body === 'string' ? Buffer.from(body) : body;
  return createHmac('sha256', secret).update(buffer).digest('base64');
}

/**
 * Genere un payload + signature pour un webhook order.created/updated.
 */
export function buildWooWebhookFixture(
  topic: string,
  secret: string,
  payload: Record<string, unknown> = woocommerceOrdersResponse[0],
) {
  const rawBody = JSON.stringify(payload);
  const signature = buildWooSignature(rawBody, secret);

  return {
    topic,
    rawBody,
    signature,
    payload,
  };
}
