import type { AiProvider, AutonomyMode } from "../../src/business-os/types.ts";
import type { IntelligenceMetadata, LocalLlmDataScope } from "../../src/intelligence/types.ts";
import { createHybridLlmClient } from "./hybridClient.ts";
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
  getStatus(): LlmStatus;
};

export type LlmStatus = IntelligenceMetadata;

export type FetchLike = (url: string | URL, init?: RequestInit) => Promise<Response>;

export type CreateLlmClientOptions = {
  provider?: AiProvider;
  apiKey?: string;
  autonomyMode?: AutonomyMode;
  localRelayUrl?: string;
  localRelayToken?: string;
  localLlmModel?: string;
  localLlmTimeoutMs?: number;
  localLlmDataScope?: LocalLlmDataScope;
  localLlmMaxInputChars?: number;
  fetchImpl?: FetchLike;
};

export function createLlmClient(options: CreateLlmClientOptions = {}): LlmClient {
  const provider = options.provider ?? "hybrid";
  if (provider === "openai") {
    return createOpenAiLlmClient({ apiKey: options.apiKey, autonomyMode: options.autonomyMode ?? "approval" });
  }
  if (provider === "hybrid") {
    return createHybridLlmClient({
      autonomyMode: options.autonomyMode ?? "approval",
      relayUrl: options.localRelayUrl,
      relayToken: options.localRelayToken,
      model: options.localLlmModel ?? "auto",
      timeoutMs: options.localLlmTimeoutMs ?? 15000,
      dataScope: options.localLlmDataScope ?? "internal",
      maxInputChars: options.localLlmMaxInputChars ?? 24000,
      fetchImpl: options.fetchImpl,
    });
  }
  return createMockLlmClient({ autonomyMode: options.autonomyMode ?? "approval" });
}
