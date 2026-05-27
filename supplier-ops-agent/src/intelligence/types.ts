import type { AiProvider } from "../business-os/types.ts";

export type LocalBrainConnectionStatus = "connected" | "fallback" | "unavailable";
export type LocalBrainMode = "local" | "rules" | "openai";
export type LocalLlmDataScope = "catalog" | "business" | "internal";

export type IntelligenceMetadata = {
  provider: AiProvider;
  dataScope: LocalLlmDataScope;
  maxInputChars: number;
  generatedAt?: string;
  localBrain: {
    status: LocalBrainConnectionStatus;
    mode: LocalBrainMode;
    model: string | null;
    message: string;
    lastUsedAt?: string;
  };
};
