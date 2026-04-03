from statistics import mean

from apps.agents.shared.base_agent import BaseAgent
from apps.agents.shared.grpc_client import contacts_pb2, intelligence_pb2


class IntelligenceAgent(BaseAgent):
    def calculate_health_scores(self, tenant_id: str, segment_id: str):
        response = self.contacts_stub.GetSegmentContacts(
            contacts_pb2.GetSegmentRequest(
                tenantId=tenant_id,
                segmentId=segment_id,
            )
        )

        updated = []

        for contact in response.contacts:
            score = 50.0

            if contact.email:
                score += 10
            if contact.phone:
                score += 10
            if contact.firstName:
                score += 5
            if contact.lastName:
                score += 5

            score = min(score, 100)

            self.contacts_stub.UpdateHealthScore(
                contacts_pb2.UpdateHealthScoreRequest(
                    tenantId=tenant_id,
                    contactId=contact.id,
                    score=score,
                )
            )

            updated.append(
                {
                    "contactId": contact.id,
                    "score": score,
                }
            )

        return {
            "updated": updated,
            "count": len(updated),
        }

    def detect_anomalies(self, tenant_id: str):
        summary = self.intelligence_stub.GetAnalyticsSummary(
            intelligence_pb2.AnalyticsRequest(
                tenantId=tenant_id,
                days=7,
            )
        )

        if summary.revenue < 100:
            insight = self.intelligence_stub.PushInsight(
                intelligence_pb2.PushInsightRequest(
                    tenantId=tenant_id,
                    type="anomaly",
                    title="Low revenue detected",
                    description=f"Revenue in the last 7 days is low: {summary.revenue}",
                    severity="high",
                )
            )
            return {
                "status": "anomaly_detected",
                "insightId": insight.id,
            }

        return {
            "status": "ok",
        }

    def forecast_revenue(self, tenant_id: str, days: int):
        forecast = self.intelligence_stub.GetRevenueForecast(
            intelligence_pb2.ForecastRequest(
                tenantId=tenant_id,
                days=days,
            )
        )

        avg = mean(forecast.dailyForecast) if forecast.dailyForecast else 0

        self.intelligence_stub.PushInsight(
            intelligence_pb2.PushInsightRequest(
                tenantId=tenant_id,
                type="forecast",
                title="Revenue forecast generated",
                description=f"Predicted revenue for {days} days: {forecast.predictedRevenue}, daily avg: {avg}",
                severity="info",
            )
        )

        return {
            "predictedRevenue": forecast.predictedRevenue,
            "dailyForecast": list(forecast.dailyForecast),
            "model": forecast.model,
        }
