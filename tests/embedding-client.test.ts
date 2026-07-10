import assert from "node:assert/strict";
import test from "node:test";

import { LocalRelayEmbeddingClient } from "../src/memory/embedding-client.ts";

test("local relay embedding client accepts Ollama-style embeddings", async () => {
  const client = new LocalRelayEmbeddingClient({
    relayUrl: "https://relay.example.com",
    relayToken: "secret",
    model: "auto",
    timeoutMs: 500,
    fetch: async (_url, init) => {
      assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer secret");
      return jsonResponse(200, {
        model: "nomic-embed-text",
        embeddings: [
          [0.1, 0.2],
          [0.3, 0.4],
        ],
      });
    },
  });

  const result = await client.embed(["first", "second"]);

  assert.deepEqual(result, {
    status: "embedded",
    model: "nomic-embed-text",
    vectors: [
      [0.1, 0.2],
      [0.3, 0.4],
    ],
  });
});

test("local relay embedding client falls back when credentials are missing", async () => {
  const client = new LocalRelayEmbeddingClient({
    relayUrl: "https://relay.example.com",
    relayToken: "",
    model: "auto",
    timeoutMs: 500,
    fetch: async () => {
      throw new Error("fetch should not be called");
    },
  });

  const result = await client.embed(["first"]);

  assert.equal(result.status, "fallback");
  assert.match(result.reason, /not configured/);
});

test("local relay embedding client falls back on malformed relay output", async () => {
  const client = new LocalRelayEmbeddingClient({
    relayUrl: "https://relay.example.com",
    relayToken: "secret",
    model: "auto",
    timeoutMs: 500,
    fetch: async () => jsonResponse(200, { embeddings: [["bad"]] }),
  });

  const result = await client.embed(["first"]);

  assert.equal(result.status, "fallback");
  assert.match(result.reason, /malformed/);
});

test("local relay embedding client falls back on timeout or network failure", async () => {
  const client = new LocalRelayEmbeddingClient({
    relayUrl: "https://relay.example.com",
    relayToken: "secret",
    model: "auto",
    timeoutMs: 1,
    fetch: async () => {
      throw new DOMException("The operation was aborted", "AbortError");
    },
  });

  const result = await client.embed(["first"]);

  assert.equal(result.status, "fallback");
  assert.match(result.reason, /timed out|failed/);
});

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  } as Response;
}
