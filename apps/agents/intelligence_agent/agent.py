from statistics import mean


class IntelligenceAgent:
    def detect_anomalies(self, tenant_id: str, metrics: dict | None = None):
        payload = metrics or {}
        revenue = float(payload.get("revenue", 0) or 0)
        roas = float(payload.get("roas", 0) or 0)
        sessions = float(payload.get("sessions", 0) or 0)
        orders = float(payload.get("orders", 0) or 0)

        anomalies: list[dict] = []

        if revenue <= 0:
            anomalies.append(
                {
                    "type": "revenue",
                    "severity": "high",
                    "message": "No revenue was reported for the requested period.",
                }
            )
        elif revenue < 100:
            anomalies.append(
                {
                    "type": "revenue",
                    "severity": "medium",
                    "message": "Revenue is very low compared with a healthy daily baseline.",
                }
            )

        if roas and roas < 1:
            anomalies.append(
                {
                    "type": "roas",
                    "severity": "high",
                    "message": "ROAS is below 1.0, so ads are not paying back current spend.",
                }
            )

        if sessions > 0 and orders == 0:
            anomalies.append(
                {
                    "type": "conversion",
                    "severity": "medium",
                    "message": "Traffic is present but no orders were recorded.",
                }
            )

        return {
            "tenantId": tenant_id,
            "status": "anomaly_detected" if anomalies else "ok",
            "anomalies": anomalies,
        }

    def forecast_revenue(self, tenant_id: str, days: int, revenue_history: list[float] | None = None):
        history = [float(value) for value in (revenue_history or [])]
        baseline = mean(history) if history else 0.0
        daily_forecast = [round(baseline, 2) for _ in range(max(days, 0))]
        predicted_revenue = round(sum(daily_forecast), 2)

        return {
            "tenantId": tenant_id,
            "predictedRevenue": predicted_revenue,
            "dailyForecast": daily_forecast,
            "model": "moving_average",
        }
