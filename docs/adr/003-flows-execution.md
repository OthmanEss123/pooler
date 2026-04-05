# ADR 003 — Exécution des Flows

## Contexte
Les flows sont des automations marketing.
Ils doivent être fiables même si le serveur crash.

## Décision
BullMQ (pas Temporal.io) pour la v1.
FlowExecutor exécute les noeuds séquentiellement.

## Pattern
- FlowExecution persisté en base (RUNNING/COMPLETED/FAILED)
- Heartbeat toutes les N secondes
- Recovery cron toutes les 15min
- TriggerRef pour idempotence

## Limites acceptées
- Pas de workflow distribué multi-noeud
- Temporal.io = amélioration future si besoin