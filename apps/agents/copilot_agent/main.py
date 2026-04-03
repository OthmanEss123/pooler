from fastapi import FastAPI
from pydantic import BaseModel

from apps.agents.copilot_agent.agent import CopilotAgent

app = FastAPI(title="Copilot Agent")
agent = CopilotAgent()


class AskBody(BaseModel):
    tenantId: str
    question: str
    context: str = ""


@app.post("/ask")
def ask(body: AskBody):
    return agent.ask(
        tenant_id=body.tenantId,
        question=body.question,
        context=body.context,
    )
