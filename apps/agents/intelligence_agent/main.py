from fastapi import FastAPI
from pydantic import BaseModel, Field

from apps.agents.intelligence_agent.agent import IntelligenceAgent

app = FastAPI(title="Intelligence Agent")
agent = IntelligenceAgent()


class RunBody(BaseModel):
    tenantId: str
    task: str
    days: int = 7
    metrics: dict = Field(default_factory=dict)
    revenueHistory: list[float] = Field(default_factory=list)


@app.post("/run")
def run(body: RunBody):
    if body.task == "detect_anomalies":
        return agent.detect_anomalies(body.tenantId, body.metrics)

    if body.task == "forecast_revenue":
        return agent.forecast_revenue(
            body.tenantId,
            body.days,
            body.revenueHistory,
        )

    return {"error": f"Unknown task: {body.task}"}
