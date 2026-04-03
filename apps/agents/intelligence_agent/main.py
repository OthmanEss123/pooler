from fastapi import FastAPI
from pydantic import BaseModel

from apps.agents.intelligence_agent.agent import IntelligenceAgent

app = FastAPI(title="Intelligence Agent")
agent = IntelligenceAgent()


class RunBody(BaseModel):
    tenantId: str
    task: str
    segmentId: str | None = None
    days: int = 7


@app.post("/run")
def run(body: RunBody):
    if body.task == "health_scores":
        if not body.segmentId:
            return {"error": "segmentId is required for health_scores"}
        return agent.calculate_health_scores(body.tenantId, body.segmentId)

    if body.task == "detect_anomalies":
        return agent.detect_anomalies(body.tenantId)

    if body.task == "forecast_revenue":
        return agent.forecast_revenue(body.tenantId, body.days)

    return {"error": f"Unknown task: {body.task}"}
