# Pilot Platform API Test Guide

```text
http://localhost:3000/api/v1
```

Auth:

- `POST /auth/register` and `POST /auth/login` set HTTP-only cookies: `access_token`, `refresh_token`, `token_family`.
- In Postman or Insomnia, keep the cookie jar enabled.
- Alternative for protected routes: send `Authorization: Bearer <access_token>` if you extracted the JWT, or `x-api-key: <apiKey>` after creating an API key.
- JSON routes need `Content-Type: application/json`.
- Role notes: many write routes require `OWNER` or `ADMIN`; audit and some billing/member actions require `OWNER`.

Useful variables:

```text
baseUrl=http://localhost:3000/api/v1
tenantId=<tenant id>
contactId=<contact id>
orderId=<order id>
productId=<product id>
campaignId=<campaign id>
segmentId=<segment id>
metricsToken=<METRICS_TOKEN from .env>
```

## 1. Public / Health

| Method | URL | Notes |
| --- | --- | --- |
| GET | `/health` | Public health check |
| GET | `/billing/plans` | Public billing plans |
| GET | `/contacts/import/template` | Public CSV template |
| GET | `/metrics` | Public route but requires `x-metrics-token` |

Metrics header:

```text
x-metrics-token: {{metricsToken}}
```

## 2. Auth

### Register

`POST /auth/register`

```json
{
  "tenantName": "Demo Store",
  "tenantSlug": "demo-store",
  "email": "owner@example.com",
  "password": "Password123!",
  "firstName": "Demo",
  "lastName": "Owner"
}
```

### Login

`POST /auth/login`

```json
{
  "email": "owner@example.com",
  "password": "Password123!"
}
```

### Auth endpoints

| Method | URL | Body / Query |
| --- | --- | --- |
| POST | `/auth/mfa/verify` | `{ "mfaTempToken": "...", "totpCode": "123456" }` |
| POST | `/auth/mfa/setup` | Protected |
| POST | `/auth/mfa/enable` | `{ "token": "123456" }` |
| POST | `/auth/mfa/disable` | `{ "token": "123456", "password": "Password123!" }` |
| POST | `/auth/refresh` | Uses refresh cookies |
| POST | `/auth/logout` | Uses cookies |
| GET | `/auth/me` | Protected |
| GET | `/auth/my-tenants` | Protected |
| POST | `/auth/switch-tenant` | `{ "tenantId": "{{tenantId}}" }` |
| POST | `/auth/api-keys` | `{ "name": "Local test", "scope": "FULL_ACCESS" }` |
| GET | `/auth/verify-email?token=<token>` | Public |
| POST | `/auth/resend-verification` | Protected |
| GET | `/auth/accept-invite?token=<token>` | Public |

API key scopes: `FULL_ACCESS`, `READ_ONLY`, `INGEST`.

## 3. Tenant / Members

| Method | URL | Body / Query |
| --- | --- | --- |
| GET | `/tenants/me` | Current tenant |
| GET | `/tenants/me/stats` | Current tenant stats |
| PATCH | `/tenants/me` | `{ "name": "New tenant name" }` |
| GET | `/tenants/me/members` | List members |
| POST | `/tenants/me/members` | `{ "email": "member@example.com", "role": "MEMBER" }` |
| PATCH | `/tenants/me/members/:userId/role` | `{ "role": "ADMIN" }` |
| DELETE | `/tenants/me/members/:userId` | Remove member |
| GET | `/tenants/me/invitations` | List invitations |
| DELETE | `/tenants/me/invitations/:id` | Revoke invitation |

Roles: `OWNER`, `ADMIN`, `MEMBER`.

## 4. Contacts

| Method | URL | Body / Query |
| --- | --- | --- |
| GET | `/contacts?limit=20&offset=0&search=demo` | List contacts |
| GET | `/contacts/:id` | Contact detail |
| POST | `/contacts` | Create contact |
| POST | `/contacts/bulk` | Bulk upsert |
| PATCH | `/contacts/:id` | Update contact |
| DELETE | `/contacts/:id` | Delete contact |
| GET | `/contacts/recent-buyers?days=30` | Recent buyers |
| GET | `/contacts/export?limit=100&offset=0` | CSV export |
| POST | `/contacts/import` | Multipart form-data field `file` |

Create contact:

```json
{
  "email": "customer@example.com",
  "firstName": "Test",
  "lastName": "Customer",
  "phone": "+212600000000"
}
```

Bulk contacts:

```json
{
  "contacts": [
    {
      "email": "a@example.com",
      "firstName": "A"
    },
    {
      "email": "b@example.com",
      "firstName": "B"
    }
  ]
}
```

## 5. Products

| Method | URL | Body / Query |
| --- | --- | --- |
| GET | `/products?limit=50&offset=0&search=shoe&category=Fashion` | List products |
| GET | `/products/low-stock` | Low stock products |
| GET | `/products/:id` | Product detail |
| POST | `/products` | Create product |
| PATCH | `/products/:id` | Update product |
| PATCH | `/products/:id/stock` | Update stock |
| DELETE | `/products/:id` | Delete product |

Create product:

```json
{
  "externalId": "prod_001",
  "name": "Demo Product",
  "sku": "SKU-001",
  "price": 199,
  "imageUrl": "https://example.com/product.jpg",
  "category": "Demo",
  "tags": ["test", "demo"],
  "isActive": true
}
```

Update stock:

```json
{
  "stockQuantity": 5,
  "lowStockAlert": 10,
  "trackStock": true
}
```

## 6. Orders

| Method | URL | Body / Query |
| --- | --- | --- |
| GET | `/orders?limit=20&offset=0&status=PAID` | List orders |
| GET | `/orders/:id` | Order detail |
| POST | `/orders` | Create order |
| PATCH | `/orders/:id/status` | Update order status |

Order statuses: `PENDING`, `PAID`, `FULFILLED`, `CANCELLED`, `REFUNDED`.

Create order:

```json
{
  "contactEmail": "customer@example.com",
  "externalId": "order_001",
  "orderNumber": "1001",
  "status": "PAID",
  "totalAmount": 199,
  "subtotal": 199,
  "currency": "MAD",
  "placedAt": "2026-05-01T10:00:00.000Z",
  "items": [
    {
      "name": "Demo Product",
      "quantity": 1,
      "unitPrice": 199,
      "totalPrice": 199
    }
  ]
}
```

Update status:

```json
{
  "status": "FULFILLED"
}
```

## 7. Posts

| Method | URL | Body / Query |
| --- | --- | --- |
| GET | `/posts?limit=10&offset=0` | List synced WordPress posts |
| GET | `/posts/:id` | Post detail |

## 8. Analytics

| Method | URL | Body / Query |
| --- | --- | --- |
| GET | `/analytics/summary?from=2026-05-01&to=2026-05-01` | Revenue, orders, sessions, ROAS |
| GET | `/analytics/revenue?from=2026-05-01&to=2026-05-31&granularity=day` | Revenue time series |
| GET | `/analytics/roas?from=2026-05-01&to=2026-05-31` | Blended ROAS time series |
| POST | `/analytics/ingest/daily` | `{ "date": "2026-05-01" }` |

Granularity: `day`, `week`, `month`.

## 9. Copilot

| Method | URL | Body / Query |
| --- | --- | --- |
| GET | `/copilot/recommendations` | Recommendations from insights |
| POST | `/copilot/ask` | Ask business question |
| GET | `/copilot/briefing` | Daily briefing |
| POST | `/copilot/briefing/refresh` | Refresh briefing |

Ask:

```json
{
  "question": "Quelles campagnes dois-je optimiser aujourd'hui ?",
  "context": {
    "period": "last_7_days"
  }
}
```

## 10. WooCommerce

| Method | URL | Body / Query |
| --- | --- | --- |
| GET | `/integrations/woocommerce/status` | Status |
| POST | `/integrations/woocommerce/connect` | Connect credentials |
| POST | `/integrations/woocommerce/disconnect` | Disconnect |
| POST | `/integrations/woocommerce/sync` | `{ "full": true }` |
| POST | `/integrations/woocommerce/webhook/:tenantId` | Public webhook |

Connect:

```json
{
  "siteUrl": "https://store.example.com",
  "consumerKey": "ck_xxx",
  "consumerSecret": "cs_xxx"
}
```

Webhook headers:

```text
x-wc-webhook-topic: order.created
x-wc-webhook-signature: <signature>
```

## 11. WordPress

| Method | URL | Body / Query |
| --- | --- | --- |
| GET | `/integrations/wordpress/status` | Status |
| POST | `/integrations/wordpress/connect` | Connect credentials |
| POST | `/integrations/wordpress/disconnect` | Disconnect |
| POST | `/integrations/wordpress/sync/users` | Sync users |
| POST | `/integrations/wordpress/sync/posts` | Sync posts |
| POST | `/integrations/wordpress/webhook/:tenantId` | Public webhook |

Connect:

```json
{
  "siteUrl": "https://site.example.com",
  "consumerKey": "ck_xxx",
  "consumerSecret": "cs_xxx"
}
```

Webhook headers:

```text
x-wp-event: post.updated
x-wp-secret: <optional secret>
```

## 12. GA4

| Method | URL | Body / Query |
| --- | --- | --- |
| GET | `/integrations/ga4/status` | Status |
| POST | `/integrations/ga4/connect` | Connect GA4 |
| POST | `/integrations/ga4/disconnect` | Disconnect |
| POST | `/integrations/ga4/sync/sessions` | Sync daily sessions |
| POST | `/integrations/ga4/events/:tenantId` | Public ingest event |

Connect:

```json
{
  "propertyId": "123456789",
  "measurementId": "G-XXXXXXX",
  "apiSecret": "secret"
}
```

Sync sessions:

```json
{
  "date": "2026-05-01",
  "sessions": 120,
  "newContacts": 8,
  "revenue": 1990,
  "orders": 10
}
```

Ingest event:

```json
{
  "eventName": "purchase",
  "occurredAt": "2026-05-01T10:00:00.000Z",
  "sessionCount": 1,
  "newContacts": 1,
  "revenue": 199,
  "orders": 1,
  "metadata": {
    "source": "test"
  }
}
```

## 13. Google Ads

| Method | URL | Body / Query |
| --- | --- | --- |
| GET | `/integrations/google-ads/oauth/url` | Get OAuth URL |
| GET | `/integrations/google-ads/oauth/callback?code=<code>&state=<state>` | Public OAuth callback |
| POST | `/integrations/google-ads/connect` | Manual connect |
| POST | `/integrations/google-ads/connect-customer` | Connect customer ID |
| POST | `/integrations/google-ads/disconnect` | Disconnect |
| POST | `/integrations/google-ads/sync/campaigns` | Sync campaigns |
| POST | `/integrations/google-ads/sync/metrics` | Sync metrics |
| POST | `/integrations/google-ads/budget` | Create budget |
| POST | `/integrations/google-ads/campaigns` | Create campaign |
| POST | `/integrations/google-ads/campaigns/performance-max` | Create Performance Max campaign |
| POST | `/integrations/google-ads/ad-groups` | Create ad group |
| GET | `/integrations/google-ads/campaigns/budget-recommendations` | Budget recommendations |
| GET | `/integrations/google-ads/campaigns` | List campaigns |
| GET | `/integrations/google-ads/campaigns/:id` | Campaign detail |
| POST | `/integrations/google-ads/campaigns/:id/pause` | Pause campaign |
| POST | `/integrations/google-ads/campaigns/:id/enable` | Enable campaign |
| PATCH | `/integrations/google-ads/campaigns/:id/budget` | Update campaign budget |
| POST | `/integrations/google-ads/audiences/sync` | Sync audience from segment |

Connect:

```json
{
  "refreshToken": "google_refresh_token",
  "customerId": "1234567890"
}
```

Connect customer:

```json
{
  "customerId": "1234567890"
}
```

Sync metrics:

```json
{
  "dateFrom": "2026-05-01",
  "dateTo": "2026-05-31"
}
```

Create budget:

```json
{
  "name": "Daily Budget Test",
  "amountMicros": 10000000,
  "deliveryMethod": "STANDARD"
}
```

Create campaign:

```json
{
  "name": "Search Campaign Test",
  "type": "SEARCH",
  "budgetDailyMicros": 10000000,
  "status": "PAUSED",
  "keywords": ["running shoes", "sport shoes"],
  "targetUrl": "https://store.example.com",
  "targetCountry": "MA",
  "targetLanguage": "fr"
}
```

Campaign types: `SEARCH`, `SHOPPING`, `PERFORMANCE_MAX`, `DISPLAY`, `VIDEO`.

Create ad group:

```json
{
  "campaignExternalId": "customers/123/campaigns/456",
  "name": "Ad Group Test",
  "cpcBidMicros": 1000000,
  "keywords": ["demo keyword"],
  "finalUrl": "https://store.example.com",
  "headline1": "Demo headline",
  "headline2": "Second headline",
  "description": "Demo description"
}
```

Update budget:

```json
{
  "budgetMicros": 15000000
}
```

Sync audience:

```json
{
  "segmentId": "{{segmentId}}",
  "audienceName": "Recent buyers"
}
```

## 14. Billing

| Method | URL | Body / Query |
| --- | --- | --- |
| GET | `/billing/usage` | Current usage |
| POST | `/billing/subscribe` | `{ "plan": "GROWTH" }` |
| POST | `/billing/cancel` | Cancel subscription |
| POST | `/billing/reactivate` | Reactivate subscription |
| GET | `/billing/portal?returnUrl=http://localhost:3001/billing` | Stripe portal |
| GET | `/billing/invoices` | Stripe invoices |
| POST | `/billing/webhook` | Public Stripe webhook |

Plans: `STARTER`, `GROWTH`, `SCALE`.
Stripe webhook header

```text
stripe-signature: <signature>
```

## 15. Audit

| Method | URL | Body / Query |
| --- | --- | --- |
| GET | `/audit-logs?limit=20&offset=0` | Owner only |
| GET | `/audit-logs?action=auth.login&entity=User&entityId=<id>` | Filtered logs |

## 16. Admin Queue Board

This one is outside `/api/v1`.

```text
GET http://localhost:3000/admin/queues
x-admin-token: <ADMIN_TOKEN>
```

It is available only when `QUEUE_ENABLED=true` and `ADMIN_TOKEN` is configured.

