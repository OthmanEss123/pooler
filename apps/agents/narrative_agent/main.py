from typing import Any, Dict, Optional

from fastapi import FastAPI
from pydantic import BaseModel

from apps.agents.narrative_agent.agent import NarrativeAgent

app = FastAPI(title="Narrative Agent")
agent = NarrativeAgent()


class AskPayload(BaseModel):
    tenantId: str
    question: str
    context: Optional[Dict[str, Any]] = None


@app.post("/narrative")
def narrative(payload: Dict[str, Any]):
    return {"narrative": agent.generate_narrative(payload)}


@app.post("/ask")
def ask(payload: AskPayload):
    return agent.ask(payload.tenantId, payload.question, payload.context)