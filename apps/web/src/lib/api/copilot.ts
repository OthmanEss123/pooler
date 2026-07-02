import { apiFetch } from "@/lib/api/client";

export type CopilotResponse = {
  answer: string;
  reasoning: string;
  actions: string[];
};

export function askCopilot(question: string, context?: Record<string, unknown>) {
  return apiFetch<CopilotResponse>("/copilot/ask", {
    method: "POST",
    body: { question, context },
  });
}
