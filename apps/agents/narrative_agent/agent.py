from typing import Any, Dict


class NarrativeAgent:
    def generate_narrative(self, payload: Dict[str, Any]) -> str:
        briefing = payload.get('briefing') if isinstance(payload.get('briefing'), dict) else payload
        yesterday = briefing.get('yesterday', {}) if isinstance(briefing, dict) else {}
        forecast = briefing.get('forecast', {}) if isinstance(briefing, dict) else {}
        insights = briefing.get('insights', []) if isinstance(briefing, dict) else []
        generated_at = briefing.get('generatedAt', '') if isinstance(briefing, dict) else ''

        top_insight = 'aucun insight critique'
        if isinstance(insights, list) and insights:
            first = insights[0]
            if isinstance(first, dict):
                top_insight = str(first.get('title') or top_insight)

        return (
            f"Briefing du {generated_at[:10] or 'jour'}: "
            f"{yesterday.get('orders', 0)} commandes pour {yesterday.get('revenue', 0)} EUR hier. "
            f"Point d'attention: {top_insight}. "
            f"Tendance sur 30 jours: {forecast.get('trend', 'flat')}."
        )

    def ask(
        self,
        tenant_id: str,
        question: str,
        context: Dict[str, Any] | None = None,
    ) -> Dict[str, Any]:
        return {
            'answer': f"Reponse a la question '{question}' pour le tenant {tenant_id}.",
            'reasoning': "Reponse generee par l'agent narrative mock.",
            'actions': [],
        }

    def suggest_campaign(
        self,
        tenant_id: str,
        goal: str,
        context: Dict[str, Any] | None = None,
    ) -> Dict[str, Any]:
        context = context or {}
        top_products = context.get('topProducts') or []
        hero_product = 'vos best-sellers'
        if isinstance(top_products, list) and top_products:
            first = top_products[0]
            if isinstance(first, dict):
                hero_product = str(first.get('name') or hero_product)

        return {
            'subjectSuggestions': [
                f"{goal} - offre prioritaire de la semaine",
                f"Relance intelligente autour de {hero_product}",
                'Derniere chance avant fermeture de l offre',
            ],
            'bodyHints': [
                'Mettre une seule promesse forte des les premieres lignes.',
                'Ajouter un CTA unique et visible au-dessus de la ligne de flottaison.',
                'Utiliser une preuve sociale ou un resultat recent.',
            ],
            'recommendedSegment': 'AT_RISK',
            'bestSendTime': 'mardi 10h',
            'estimatedOpenRate': '18-22%',
            'reasoning': f"Suggestion mock pour {tenant_id} avec objectif '{goal}'.",
        }
