export type EmbeddingResult =
  | {
      status: "embedded";
      model: string;
      vectors: number[][];
    }
  | {
      status: "fallback";
      reason: string;
    };

export type EmbeddingClient = {
  embed(texts: string[]): Promise<EmbeddingResult>;
};

export function createDisabledEmbeddingClient(reason = "Embeddings are disabled"): EmbeddingClient {
  return {
    async embed() {
      return { status: "fallback", reason };
    },
  };
}

export type EmbeddingFetch = (url: string | URL, init?: RequestInit) => Promise<Response>;

export type LocalRelayEmbeddingClientOptions = {
  relayUrl?: string;
  relayToken?: string;
  model: string;
  timeoutMs: number;
  fetch?: EmbeddingFetch;
};

export class LocalRelayEmbeddingClient implements EmbeddingClient {
  readonly #relayUrl?: string;
  readonly #relayToken?: string;
  readonly #model: string;
  readonly #timeoutMs: number;
  readonly #fetch: EmbeddingFetch;

  constructor(options: LocalRelayEmbeddingClientOptions) {
    this.#relayUrl = options.relayUrl;
    this.#relayToken = options.relayToken;
    this.#model = options.model;
    this.#timeoutMs = options.timeoutMs;
    this.#fetch = options.fetch ?? fetch;
  }

  async embed(texts: string[]): Promise<EmbeddingResult> {
    const input = texts.map((text) => text.trim()).filter(Boolean);
    if (!input.length) {
      return { status: "embedded", model: this.#model, vectors: [] };
    }
    if (!this.#relayUrl || !this.#relayToken) {
      return { status: "fallback", reason: "Local embedding relay is not configured" };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      const response = await this.#fetch(new URL("/api/embed", this.#relayUrl), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.#relayToken}`,
        },
        body: JSON.stringify({ model: this.#model, input }),
        signal: controller.signal,
      });

      if (!response.ok) {
        return { status: "fallback", reason: `Local embedding relay returned HTTP ${response.status}` };
      }

      const body = await response.json();
      const parsed = parseEmbeddingResponse(body, input.length);
      if (!parsed) {
        return { status: "fallback", reason: "Local embedding relay returned malformed embeddings" };
      }

      return parsed;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof DOMException && error.name === "AbortError") {
        return { status: "fallback", reason: `Local embedding relay timed out after ${this.#timeoutMs}ms` };
      }
      return { status: "fallback", reason: `Local embedding relay failed: ${message}` };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function parseEmbeddingResponse(body: unknown, expectedCount: number): EmbeddingResult | null {
  const object = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const model = typeof object.model === "string" ? object.model : "local-embedding";
  const vectors = extractVectors(object);

  if (!vectors || vectors.length !== expectedCount || !vectors.every(isNumberVector)) {
    return null;
  }

  return {
    status: "embedded",
    model,
    vectors,
  };
}

function extractVectors(object: Record<string, unknown>): unknown[][] | null {
  if (Array.isArray(object.embeddings)) {
    return object.embeddings as unknown[][];
  }
  if (Array.isArray(object.data)) {
    return object.data.map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>).embedding : null));
  }
  if (Array.isArray(object.embedding)) {
    return [object.embedding];
  }
  return null;
}

function isNumberVector(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
}
