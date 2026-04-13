# Pilot Platform Backend

Backend NestJS multi-tenant recentre sur trois integrations metier:

- WooCommerce pour la synchronisation boutique, les webhooks et l'alimentation contacts, commandes et produits.
- Google Ads pour l'OAuth, la synchro campagnes, les metrics, les audiences et les budgets.
- GA4 pour la connexion, la synchro sessions et l'ingestion d'evenements.

## Surface conservee

- Auth: register, login, refresh, logout, switch tenant, API keys, MFA.
- Tenants et memberships.
- Contacts, orders, products.
- Queue BullMQ + Redis pour les jobs de sync.
- Analytics + ClickHouse pour les metrics GA4 et Google Ads.
- Copilot: briefing, ask, recommendations.
- Audit, metrics, health.

## Integrations actives

- `/integrations/woocommerce/*`
- `/integrations/google-ads/*`
- `/integrations/ga4/*`

Aucune autre route d'integration, d'automation ou de transport interne n'est exposee.

## Crons conserves

- `0 2 * * *` ingest quotidien analytics.
- `0 3 * * *` intelligence Google Ads et stock alerts.
- `0 4 * * *` cleanup tokens et API keys expires.

## Agents Python conserves

- `copilot_agent` sur le port `8003`
- `intelligence_agent` sur le port `8004`

Seuls `copilot_agent` et `intelligence_agent` font partie du projet.

## Stack

- NestJS 11
- Prisma + PostgreSQL
- ClickHouse
- Redis + BullMQ
- FastAPI pour les agents Python restants

## Demarrage local

```bash
npm ci --legacy-peer-deps
npx prisma generate
npx prisma migrate dev
npm run build
npm run start:dev
```

Pour l'infra locale:

```bash
docker compose up -d postgres redis clickhouse
```

## Validation

```bash
npx prisma validate
npx tsc --noEmit
npm run lint
npm run build
npm run test:e2e
```
