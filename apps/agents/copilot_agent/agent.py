from anthropic import Anthropic

from apps.agents.shared.base_agent import BaseAgent
from apps.agents.shared.config import ANTHROPIC_API_KEY
from apps.agents.shared.grpc_client import intelligence_pb2


class CopilotAgent(BaseAgent):
    def __init__(self):
        super().__init__()
        self.client = Anthropic(api_key=ANTHROPIC_API_KEY) if ANTHROPIC_API_KEY else None

    def ask(self, tenant_id: str, question: str, context: str = ""):
        analytics = self.intelligence_stub.GetAnalyticsSummary(
            intelligence_pb2.AnalyticsRequest(
                tenantId=tenant_id,
                days=7,
            )
        )

        forecast = self.intelligence_stub.GetRevenueForecast(
            intelligence_pb2.ForecastRequest(
                tenantId=tenant_id,
                days=7,
            )
        )

        if not self.client:
            fallback = self.intelligence_stub.AskCopilot(
                intelligence_pb2.CopilotRequest(
                    tenantId=tenant_id,
                    question=question,
                    context=context,
                )
            )

            return {
                "answer": fallback.answer,
                "reasoning": fallback.reasoning,
                "actions": list(fallback.actions),
            }

        prompt = f"""
You are a SaaS growth copilot.

Tenant: {tenant_id}
Question: {question}
Context: {context}

Analytics:
- Revenue: {analytics.revenue}
- Orders: {analytics.orders}
- Customers: {analytics.customers}
- AOV: {analytics.averageOrderValue}
- Summary: {analytics.summary}

Forecast:
- Predicted revenue: {forecast.predictedRevenue}
- Daily forecast: {list(forecast.dailyForecast)}

Return:
1. concise answer
2. reasoning
3. suggested actions
"""

        response = self.client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=800,
            messages=[
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
        )

        text = ""
        for block in response.content:
            if getattr(block, "type", None) == "text":
                text += block.text

        self.intelligence_stub.PushInsight(
            intelligence_pb2.PushInsightRequest(
                tenantId=tenant_id,
                type="copilot",
                title="Copilot interaction",
                description=f"Question: {question}",
                severity="info",
            )
        )

        return {
            "answer": text.strip(),
            "reasoning": "Generated from analytics and forecast context.",
            "actions": [],
        }
