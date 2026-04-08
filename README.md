# Pilot Platform Backend v2.0.0

Backend NestJS multi-tenant pour orchestration CRM, analytics, campagnes, flows, insights, copilot, Google Ads, GA4 et WooCommerce.

## Architecture

```text
                        +-----------------------+
                        |  Frontend / Clients   |
                        +-----------+-----------+
                                    |
                             HTTP / Cookies / JWT
                                    |
                         +----------v-----------+
                         |  NestJS API / REST   |
                         |  AccessGuard / RBAC  |
                         +----+-----+-----+-----+
                              |     |     |
             +----------------+     |     +----------------+
             |                      |                      |
   +---------v---------+   +--------v--------+   +---------v---------+
   | PostgreSQL        |   | Redis / BullMQ  |   | ClickHouse        |
   | Prisma / Supabase |   | cache + queues  |   | analytics store   |
   +---------+---------+   +--------+--------+   +---------+---------+
             |                      |                      |
             |                      |                      |
   +---------v---------+   +--------v--------+   +---------v---------+
   | Contacts/Orders   |   | Sync/Campaign   |   | Revenue/ROAS/     |
   | Campaigns/Flows   |   | jobs            |   | funnel metrics    |
   +-------------------+   +-----------------+   +-------------------+

                     +------------------------------+
                     | Python Narrative Agent       |
                     | /narrative /ask /suggest-*   |
                     +------------------------------+
```

Flux principaux:

- Auth + switch tenant par memberships.
- Ingest analytics dans ClickHouse, lecture agrge via `AnalyticsService`.
- Orchestration flows/campaigns via Redis + BullMQ.
- Copilot: briefing cache Redis, recommandations, ask, campaign assist.
- Intgrations: Google Ads, GA4, WooCommerce webhooks + sync.
- Embeddings contacts via pgvector et recherche smantique.

## Stack technique

- API: NestJS 11, TypeScript 5
- ORM: Prisma 7
- Base relationnelle: PostgreSQL / Supabase
- Analytics: ClickHouse
- Cache / queues: Redis, BullMQ
- Auth: JWT + cookies httpOnly + API keys
- Scheduling: `@nestjs/schedule`
- Email: AWS SES + SNS webhooks
- Agents Python: FastAPI
- Intgrations: Google Ads, GA4, WooCommerce
- CI/CD: GitHub Actions + Docker + script de dploiement

## Installation complte

### 1. Prrequis

- Node.js 20+
- npm 10+
- PostgreSQL 15+
- Redis 7+
- ClickHouse
- Python 3.11+ pour les agents

### 2. Variables d'environnement

Copier `.env.example` vers `.env`, puis completer les secrets.

### 3. Installation locale

```bash
npm ci --legacy-peer-deps
npx prisma generate
npx prisma migrate dev
npm run build
npm run start:dev
```

### 4. Demarrage infra locale avec Docker

```bash
docker compose up -d postgres redis clickhouse
```

### 5. Demarrage complet avec Docker

```bash
docker build -f infra/api.Dockerfile .
docker compose up --build
```

## Variables d'environnement

| Variable                       | Description                          |
| ------------------------------ | ------------------------------------ |
| `NODE_ENV`                     | Environnement d'execution            |
| `PORT`                         | Port HTTP API                        |
| `FRONTEND_URL`                 | URL frontend autorise                |
| `DATABASE_URL`                 | Connexion Prisma / PostgreSQL        |
| `DIRECT_URL`                   | Connexion directe migrations Prisma  |
| `CLICKHOUSE_URL`               | URL ClickHouse                       |
| `CLICKHOUSE_USER`              | Utilisateur ClickHouse               |
| `CLICKHOUSE_PASSWORD`          | Mot de passe ClickHouse              |
| `CLICKHOUSE_DB`                | Base ClickHouse                      |
| `JWT_SECRET`                   | Secret JWT                           |
| `JWT_EXPIRES_IN`               | Dure token d'accs                    |
| `QUEUE_ENABLED`                | Active ou non les queues BullMQ      |
| `REDIS_URL`                    | Connexion Redis                      |
| `ENCRYPTION_KEY`               | Cl AES-256 hexadcimale               |
| `METRICS_TOKEN`                | Token de protection endpoint metrics |
| `GRPC_HOST`                    | Host gRPC local                      |
| `GRPC_PORT`                    | Port gRPC                            |
| `GRPC_SHARED_SECRET`           | Secret partag gRPC                   |
| `ANTHROPIC_API_KEY`            | Cl agent IA externe ventuelle        |
| `GOOGLE_CLIENT_ID`             | OAuth Google Ads                     |
| `GOOGLE_CLIENT_SECRET`         | OAuth Google Ads                     |
| `GOOGLE_ADS_DEVELOPER_TOKEN`   | Token API Google Ads                 |
| `GOOGLE_ADS_REDIRECT_URI`      | Callback OAuth Google Ads            |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | Compte manager Google Ads            |
| `GOOGLE_ADS_API_VERSION`       | Version API Google Ads               |
| `AWS_ACCESS_KEY_ID`            | AWS SES                              |
| `AWS_SECRET_ACCESS_KEY`        | AWS SES                              |
| `AWS_REGION`                   | Region AWS                           |
| `SES_CONFIG_SET`               | Configuration set SES                |
| `SES_FROM_DEFAULT`             | Adresse expediteur par defaut        |
| `SNS_TOPIC_ARN`                | Topic SNS SES                        |
| `APP_VERSION`                  | Version applicative                  |
| `WOOCOMMERCE_WEBHOOK_SECRET`   | Secret HMAC webhooks WooCommerce     |
| `OPENAI_API_KEY`               | Embeddings OpenAI                    |
| `NARRATIVE_AGENT_URL`          | URL du narrative agent FastAPI       |

## Modules

- `AuthModule`: register, login, refresh, logout, switch tenant, API keys, nettoyage tokens.
- `TenantsModule`: tenant courant et mtadonnes tenant.
- `MembershipsModule`: gestion membres et rles.
- `ContactsModule`: CRUD contacts, bulk import, suppressions, embeddings, similar contacts.
- `OrdersModule`: CRUD commandes et mises jour de statut.
- `ProductsModule`: catalogue produits.
- `CampaignsModule`: cration, planification, AB tests, stats, envoi.
- `FlowsModule`: automation multi-trigger, activation, pause, excutions.
- `InsightsModule`: insights, health scores, gnration nocturne.
- `CopilotModule`: briefing, recommandations, ask, campaign assist, stock alerts.
- `AnalyticsModule`: revenue, ROAS, funnel, ingest quotidien, briefings matinaux.
- `EmailEventsModule`: webhooks email et tracking contact/campaign.
- `EmailProviderModule`: deliverability, bounce, complaint, suppressions.
- `MetricsModule`: endpoint technique protg par token.
- `AuditModule`: lecture des audit logs.
- `Ga4Module`: connexion GA4, ingest vnements et sessions.
- `GoogleAdsModule`: OAuth, sync campagnes, sync metrics, audiences, analyses.
- `WooCommerceModule`: connexion, sync, status, webhook, upsert contacts/orders/products.
- `QueueModule`: jobs BullMQ sync/campaign.
- `GrpcModule`: exposition interne gRPC.

## Integrations disponibles

| Integration  | Endpoints                      |
| ------------ | ------------------------------ |
| Shopify      | `/integrations/shopify/*`      |
| WooCommerce  | `/integrations/woocommerce/*`  |
| Google Ads   | `/integrations/google-ads/*`   |
| Facebook Ads | `/integrations/facebook-ads/*` |
| GA4          | `/integrations/ga4/*`          |

## Endpoints complets

Base URL: `/api/v1`

### Auth

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /auth/my-tenants`
- `POST /auth/switch-tenant`
- `POST /auth/api-keys`

### Tenants / memberships

- `GET /tenants/me`
- `GET /tenants/me/stats`
- `PATCH /tenants/me`
- `GET /tenants/me/members`
- `POST /tenants/me/members`
- `PATCH /tenants/me/members/:userId/role`
- `DELETE /tenants/me/members/:userId`

### Contacts

- `GET /contacts`
- `GET /contacts/recent-buyers`
- `POST /contacts/embed`
- `GET /contacts/:id/similar`
- `GET /contacts/:id`
- `POST /contacts`
- `POST /contacts/bulk`
- `POST /contacts/sync-suppression`
- `PATCH /contacts/:id`
- `DELETE /contacts/:id`

### Orders / products

- `GET /orders`
- `GET /orders/:id`
- `POST /orders`
- `PATCH /orders/:id/status`
- `GET /products`
- `GET /products/:id`
- `POST /products`
- `PATCH /products/:id`
- `DELETE /products/:id`

### Campaigns

- `POST /campaigns`
- `GET /campaigns`
- `GET /campaigns/:id`
- `GET /campaigns/:id/stats`
- `PATCH /campaigns/:id`
- `POST /campaigns/:id/send`
- `POST /campaigns/:id/schedule`
- `POST /campaigns/:id/pause`
- `POST /campaigns/:id/cancel`
- `POST /campaigns/:id/ab-tests`
- `POST /campaigns/:id/ab-tests/:variantId/winner`
- `DELETE /campaigns/:id`

### Flows

- `POST /flows`
- `GET /flows`
- `GET /flows/:id`
- `PATCH /flows/:id`
- `POST /flows/:id/activate`
- `POST /flows/:id/pause`
- `DELETE /flows/:id`
- `POST /flows/:id/trigger`
- `GET /flows/:id/executions`

### Segments

- `GET /segments`
- `GET /segments/:id`
- `POST /segments/preview`
- `GET /segments/:id/members`
- `POST /segments`
- `POST /segments/:id/sync`
- `DELETE /segments/:id`

### Analytics / insights / copilot

- `GET /analytics/summary`
- `GET /analytics/revenue`
- `GET /analytics/roas`
- `GET /analytics/email-funnel`
- `POST /analytics/ingest/daily`
- `GET /insights/health-scores/distribution`
- `GET /insights`
- `POST /insights/:id/read`
- `DELETE /insights/:id`
- `POST /insights/generate`
- `GET /copilot/briefing`
- `POST /copilot/briefing/refresh`
- `GET /copilot/recommendations`
- `POST /copilot/ask`
- `POST /copilot/campaign-suggest`
- `GET /copilot/narrative`

### Email / deliverability

- `GET /email-events/contact/:contactId`
- `GET /email-events/campaign/:campaignId`
- `POST /email-events/webhook`
- `POST /email-events/ses-webhook`
- `GET /deliverability/report`
- `GET /deliverability/bounce-rate`
- `GET /deliverability/complaint-rate`
- `POST /deliverability/suppress`

### Integrations

- `GET /integrations/google-ads/oauth/url`
- `GET /integrations/google-ads/oauth/callback`
- `POST /integrations/google-ads/connect`
- `POST /integrations/google-ads/disconnect`
- `POST /integrations/google-ads/sync/campaigns`
- `POST /integrations/google-ads/sync/metrics`
- `GET /integrations/google-ads/campaigns`
- `GET /integrations/google-ads/campaigns/:id`
- `POST /integrations/google-ads/audiences/sync`
- `GET /integrations/ga4/status`
- `POST /integrations/ga4/connect`
- `POST /integrations/ga4/disconnect`
- `POST /integrations/ga4/sync/sessions`
- `POST /integrations/ga4/events/:tenantId`
- `GET /integrations/woocommerce/status`
- `POST /integrations/woocommerce/connect`
- `POST /integrations/woocommerce/disconnect`
- `POST /integrations/woocommerce/sync`
- `POST /integrations/woocommerce/webhook/:tenantId`

### Audit / health / metrics

- `GET /audit-logs`
- `GET /health`
- `GET /metrics`

## Agents Python

| Agent                | Port   | Role                       |
| -------------------- | ------ | -------------------------- |
| `narrative_agent`    | `8001` | Morning briefing + ask     |
| `forecast_agent`     | `8002` | Revenue forecasting        |
| `copilot_agent`      | `8003` | Campaign suggestions       |
| `intelligence_agent` | `8004` | Insights + recommendations |

Agent HTTP principal documente actuellement:

- `POST /narrative`
- `POST /ask`
- `POST /suggest-campaign`

Lancement local suggere:

```bash
uvicorn apps.agents.narrative_agent.main:app --host 0.0.0.0 --port 8001
```

Couplage backend:

- `BriefingService` appelle `/narrative` avec timeout 10s.
- `CopilotService` appelle `/ask`.
- `CampaignAssistService` appelle `/suggest-campaign`.
- Si `NARRATIVE_AGENT_URL` est vide en test ou indisponible, le backend utilise les fallbacks locaux.

## Crons

- `0 1 * * *` -> embeddings contacts via `EmbeddingsService.embedAllContacts()`.
- `0 2 * * *` -> ingest analytics quotidien dans ClickHouse.
- `0 3 * * *` -> insights + health scores + deliverability + Google Ads intelligence + stock alerts.
- `0 4 * * *` -> cleanup refresh tokens et API keys expires.
- `0 7 * * *` -> generation des briefings matinaux avec cache Redis.

## Dploiement Docker + CI/CD

### Docker

Build image API:

```bash
docker build -f infra/api.Dockerfile .
```

Le `Dockerfile` expose:

- `3000` pour l'API HTTP
- `50051` pour gRPC

Le `docker-compose.yml` demarre:

- `api`
- `postgres`
- `redis`
- `clickhouse`

### CI

Pipeline GitHub Actions: `.github/workflows/ci.yml`

Etapes:

- checkout
- setup Node 20
- `npm ci --legacy-peer-deps`
- `npx prisma generate`
- `npx prisma migrate deploy`
- `npm run lint`
- `npm run build`
- `npm run test:e2e`

### Deploiement scripte

```bash
sh scripts/deploy.sh
```

Le script:

- build l'application
- applique `prisma migrate deploy`
- redemarre PM2

## Audit final

Verifications executees dans ce worktree:

- `npx tsc --noEmit` -> OK
- `npm run lint` -> OK
- `npm run build` -> OK
- `npm run test:e2e` -> OK
- `rg "console\.log|TODO" src test apps` -> aucun resultat

Points notables:

- Les logs d'erreurs visibles pendant les e2e proviennent de scenarios attendus 400/401/403/404.
- Les fallbacks copilot/narrative sont actifs quand l'agent Python n'est pas configure.
- Le workflow CI couvre lint, build et e2e sur PostgreSQL + Redis + ClickHouse.

## Roadmap semaines 1-20

- S1: auth multi-tenant et base Prisma.
- S2: contacts, orders, products.
- S3: campaigns et email events.
- S4: flows automation.
- S5: analytics ClickHouse.
- S6: deliverability et suppressions.
- S7: insights et health scores.
- S8: queueing BullMQ et jobs.
- S9: Google Ads OAuth + sync.
- S10: GA4 ingest.
- S11: audit logs et metrics.
- S12: gRPC interne.
- S13: WooCommerce sync + webhooks.
- S14: embeddings pgvector.
- S15: segments semantiques.
- S16: morning briefing Redis + narrative.
- S17: stock alerts et campaign assist.
- S18: copilot endpoints complets.
- S19: e2e complets + fallbacks agents.
- S20: audit final, Docker, CI/CD, release v2.
