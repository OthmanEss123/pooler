# ADR 001 — Stratégie Multi-Tenant

## Contexte
Pilot Platform est un SaaS multi-tenant.
Chaque tenant = une organisation cliente.

## Décision
Isolation par `tenantId` dans chaque table.
Pas de schémas DB séparés (trop complexe pour ce stade).

## Pattern appliqué
- Chaque model Prisma a `tenantId String`
- Chaque query filtre par `tenantId`
- JWT contient `tenantId` dans le payload
- `@CurrentTenant()` decorator l'extrait
- `switch-tenant` via membership vérifié

## Conséquences
+ Simple à maintenir
+ Prisma gère tout
- Requiert discipline sur chaque query
- Fuite inter-tenant si query oubliée