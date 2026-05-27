import type { AiProvider, AutonomyMode } from "../../src/business-os/types.ts";
import { createMockLlmClient } from "./mockClient.ts";
import { createOpenAiLlmClient } from "./openaiClient.ts";

export type LlmDecisionRequest = {
  agentName: string;
  task: string;
  input: Record<string, unknown>;
  schema?: Record<string, unknown>;
};

export type LlmClient = {
  provider: AiProvider;
  decide<T>(request: LlmDecisionRequest): Promise<T>;
};

export type CreateLlmClientOptions = {
  provider?: AiProvider;
  apiKey?: string;
  autonomyMode?: AutonomyMode;
};

export function createLlmClient(options: CreateLlmClientOptions = {}): LlmClient {
  const provider = options.provider ?? "mock";
  if (provider === "openai") {
    return createOpenAiLlmClient({ apiKey: options.apiKey, autonomyMode: options.autonomyMode ?? "approval" });
  }
  return createMockLlmClient({ autonomyMode: options.autonomyMode ?? "approval" });
}
