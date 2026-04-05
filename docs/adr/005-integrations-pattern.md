# ADR 005 — Pattern Intégrations Externes

## Contexte
Shopify, WooCommerce, Google Ads, GA4
ont des APIs différentes et des credentials sensibles.

## Décision
Chaque intégration = 3 couches :
1. `*-api.client.ts`   → HTTP + retry + erreurs
2. `*-mapper.ts`       → mapping pur sans side effects
3. `*.service.ts`      → orchestration + persistance

## Credentials
- Chiffrés AES-256-CBC avant stockage
- EncryptionService centralisé
- Jamais loggés

## Retry
- 429 → Retry-After header
- 5xx → exponential backoff x3