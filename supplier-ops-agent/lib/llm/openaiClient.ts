import type { AutonomyMode } from "../../src/business-os/types.ts";
import type { LlmClient, LlmDecisionRequest } from "./index.ts";

export function createOpenAiLlmClient(options: { apiKey?: string; autonomyMode: AutonomyMode }): LlmClient {
  return {
    provider: "openai",
    async decide<T>(request: LlmDecisionRequest): Promise<T> {
      if (!options.apiKey) {
        throw new Error("OPENAI_API_KEY is required when AI_PROVIDER=openai");
      }

      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          input: [
            {
              role: "system",
              content:
                "Return only structured JSON for the LWT Business Operating Agent. Recommend tool calls, never execute them.",
            },
            {
              role: "user",
              content: JSON.stringify({
                agentName: request.agentName,
                task: request.task,
                autonomyMode: options.autonomyMode,
                input: request.input,
                schema: request.schema,
              }),
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI decision request failed with status ${response.status}`);
      }

      const body = (await response.json()) as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
      const outputText = body.output_text ?? body.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("\n");
      if (!outputText) {
        throw new Error("OpenAI response did not include JSON text");
      }
      return JSON.parse(outputText) as T;
    },
  };
}
