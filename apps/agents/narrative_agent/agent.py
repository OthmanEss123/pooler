from typing import Any, Dict


class NarrativeAgent:
    def generate_narrative(self, payload: Dict[str, Any]) -> str:
        revenue = payload.get("revenue", 0)
        orders = payload.get("orders", 0)
        top_insight = payload.get("topInsight") or "aucun insight critique"
        email_stats = payload.get("emailStats", {})

        return (
            f"Hier, la boutique a généré {orders} commandes pour un chiffre d'affaires de {revenue}. "
            f"Côté email, {email_stats.get('delivered', 0)} emails ont été délivrés, "
            f"{email_stats.get('opened', 0)} ouverts et {email_stats.get('clicked', 0)} cliqués.\n\n"
            f"Point d'attention principal : {top_insight}. Vérifie aussi les bounces ({email_stats.get('bounced', 0)}) "
            f"et les plaintes ({email_stats.get('complained', 0)}).\n\n"
            f"Actions recommandées aujourd'hui : optimiser les campagnes peu rentables, surveiller la délivrabilité, "
            f"et prioriser les segments à forte valeur."
        )

    def ask(
        self,
        tenant_id: str,
        question: str,
        context: Dict[str, Any] | None = None,
    ) -> Dict[str, Any]:
        return {
            "answer": f"Réponse à la question '{question}' pour le tenant {tenant_id}.",
            "reasoning": "Réponse générée par l'agent narrative mock.",
            "actions": [],
        }