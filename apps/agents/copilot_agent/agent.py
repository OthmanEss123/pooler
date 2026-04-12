from anthropic import Anthropic

from apps.agents.shared.config import ANTHROPIC_API_KEY


class CopilotAgent:
    def __init__(self):
        self.client = Anthropic(api_key=ANTHROPIC_API_KEY) if ANTHROPIC_API_KEY else None

    def ask(self, tenant_id: str, question: str, context: str = ""):
        if self.client:
            answer = self._ask_with_anthropic(tenant_id, question, context)
            reasoning = "Generated with Anthropic from the provided tenant context."
        else:
            answer = self._fallback_answer(question, context)
            reasoning = "Generated locally from the provided question and context."

        return {
            "answer": answer,
            "reasoning": reasoning,
            "actions": self._suggest_actions(question, context),
        }

    def _ask_with_anthropic(self, tenant_id: str, question: str, context: str) -> str:
        prompt = f"""
You are Pilot's commerce copilot.
Focus only on WooCommerce, Google Ads, and GA4.
Give a concise answer in plain language, then suggest practical next steps.

Tenant: {tenant_id}
Question: {question}
Context: {context or 'No extra context provided.'}
"""

        response = self.client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=600,
            messages=[{"role": "user", "content": prompt}],
        )

        text = ""
        for block in response.content:
            if getattr(block, "type", None) == "text":
                text += block.text

        return text.strip() or self._fallback_answer(question, context)

    def _fallback_answer(self, question: str, context: str) -> str:
        focus = []
        lowered = f"{question} {context}".lower()

        if "ga4" in lowered or "analytics" in lowered or "session" in lowered:
            focus.append("review GA4 session trends and event quality")
        if "google ads" in lowered or "roas" in lowered or "budget" in lowered:
            focus.append("check Google Ads spend, ROAS, and budget pacing")
        if "woocommerce" in lowered or "store" in lowered or "order" in lowered:
            focus.append("verify WooCommerce orders, products, and webhook freshness")

        if not focus:
            focus.append("review WooCommerce, Google Ads, and GA4 signals together")

        joined_focus = ", then ".join(focus)
        return (
            "Start by "
            f"{joined_focus}. "
            "Use the freshest sync data first, compare anomalies against the last 7 days, "
            "and turn the strongest signal into one concrete action for today."
        )

    def _suggest_actions(self, question: str, context: str) -> list[str]:
        lowered = f"{question} {context}".lower()
        actions: list[str] = []

        if "budget" in lowered or "roas" in lowered or "campaign" in lowered:
            actions.append("Review campaign budgets against the latest ROAS by campaign.")
        if "session" in lowered or "traffic" in lowered or "ga4" in lowered:
            actions.append("Compare GA4 sessions and new contacts for the last 7 days.")
        if "stock" in lowered or "product" in lowered or "order" in lowered:
            actions.append("Check WooCommerce product stock and recent paid orders.")

        if not actions:
            actions.append("Pull the latest WooCommerce, Google Ads, and GA4 summaries before deciding.")

        return actions[:3]
