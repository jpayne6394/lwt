import type { LocalLlmDataScope } from "../../src/intelligence/types.ts";
import type { FetchLike, LlmClient, LlmDecisionRequest, LlmStatus } from "./index.ts";
import { createMockLlmClient } from "./mockClient.ts";

export function createHybridLlmClient(options: {
  autonomyMode: string;
  relayUrl?: string;
  relayToken?: string;
  model: string;
  timeoutMs: number;
  dataScope: LocalLlmDataScope;
  maxInputChars: number;
  fetchImpl?: FetchLike;
}): LlmClient {
  const fallback = createMockLlmClient({ autonomyMode: options.autonomyMode });
  let status = hybridStatus({
    status: options.relayUrl && options.relayToken ? "unavailable" : "fallback",
    mode: "rules",
    model: null,
    message: options.relayUrl && options.relayToken ? "Local brain relay has not been contacted yet." : "Local brain relay URL or token is missing.",
  });

  function hybridStatus(localBrain: LlmStatus["localBrain"]): LlmStatus {
    return {
      provider: "hybrid",
      dataScope: options.dataScope,
      maxInputChars: options.maxInputChars,
      generatedAt: new Date().toISOString(),
      localBrain,
    };
  }

  return {
    provider: "hybrid",
    getStatus: () => status,
    async decide<T>(request: LlmDecisionRequest): Promise<T> {
      if (!options.relayUrl || !options.relayToken) {
        status = hybridStatus({
          status: "fallback",
          mode: "rules",
          model: null,
          message: !options.relayToken ? "Local brain relay token is missing; using deterministic fallback." : "Local brain relay URL is missing; using deterministic fallback.",
        });
        return fallback.decide<T>(request);
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
      try {
        const response = await (options.fetchImpl ?? fetch)(`${trimTrailingSlash(options.relayUrl)}/api/local-llm/decide`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${options.relayToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            agentName: request.agentName,
            task: request.task,
            model: options.model,
            dataScope: options.dataScope,
            maxInputChars: options.maxInputChars,
            input: truncateInput(request.input, options.maxInputChars),
            schema: request.schema,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const text = await response.text();
        if (!response.ok) {
          throw new Error(`local relay returned ${response.status}`);
        }
        const body = JSON.parse(text) as { model?: string; decision?: unknown; outputText?: string };
        const decision = parseDecision(body.decision ?? body.outputText);
        status = hybridStatus({
          status: "connected",
          mode: "local",
          model: body.model ?? options.model,
          message: "Local brain connected through the protected relay.",
          lastUsedAt: new Date().toISOString(),
        });
        return decision as T;
      } catch (error) {
        clearTimeout(timeout);
        status = hybridStatus({
          status: "fallback",
          mode: "rules",
          model: null,
          message: `Local brain fallback: ${error instanceof Error ? error.message : "local relay failed"}.`,
        });
        return fallback.decide<T>(request);
      }
    },
  };
}

function parseDecision(value: unknown): Record<string, unknown> {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("local relay returned malformed decision JSON");
  }
  return parsed as Record<string, unknown>;
}

function truncateInput(input: Record<string, unknown>, maxInputChars: number): Record<string, unknown> {
  const raw = JSON.stringify(input);
  if (raw.length <= maxInputChars) {
    return input;
  }
  return {
    truncated: true,
    originalCharCount: raw.length,
    text: raw.slice(0, maxInputChars),
  };
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
