import assert from "node:assert/strict";
import test from "node:test";

import { createLlmClient } from "../lib/llm/index.ts";

test("hybrid LLM provider returns structured local decisions through the protected relay", async () => {
  const requests: Array<{ url: string; body: any; authorization: string | null }> = [];
  const client = createLlmClient({
    provider: "hybrid",
    autonomyMode: "approval",
    localRelayUrl: "https://local-brain.example",
    localRelayToken: "relay-secret",
    localLlmModel: "auto",
    fetchImpl: async (url, init) => {
      requests.push({
        url: String(url),
        body: JSON.parse(String(init?.body)),
        authorization: new Headers(init?.headers).get("authorization"),
      });
      return new Response(
        JSON.stringify({
          ok: true,
          model: "qwen3:8b",
          decision: {
            summary: "Local model reviewed the daily business context.",
            risk_level: "low",
            recommended_actions: [],
            requires_approval: true,
            safe_to_auto_execute: false,
            reasoning_summary: "Local intelligence improved the explanation without executing tools.",
            rollback_plan: "Use the deterministic fallback recommendation.",
          },
        }),
        { status: 200 },
      );
    },
  });

  const decision = await client.decide<{ summary: string }>({
    agentName: "Chief of Staff Agent",
    task: "Create daily command report",
    input: { privateContext: "allowed because data scope is internal" },
  });

  assert.equal(decision.summary, "Local model reviewed the daily business context.");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://local-brain.example/api/local-llm/decide");
  assert.equal(requests[0].authorization, "Bearer relay-secret");
  assert.equal(requests[0].body.model, "auto");
  assert.equal(client.getStatus().localBrain.status, "connected");
  assert.equal(client.getStatus().localBrain.model, "qwen3:8b");
});

test("hybrid LLM provider falls back safely when relay credentials are missing", async () => {
  let called = false;
  const client = createLlmClient({
    provider: "hybrid",
    autonomyMode: "approval",
    localRelayUrl: "https://local-brain.example",
    fetchImpl: async () => {
      called = true;
      throw new Error("Should not call an unauthenticated relay");
    },
  });

  const decision = await client.decide<any>({
    agentName: "Marketing Agent",
    task: "Draft campaign",
    input: {},
  });

  assert.equal(called, false);
  assert.match(decision.summary, /mock decision/i);
  assert.equal(client.getStatus().localBrain.status, "fallback");
  assert.match(client.getStatus().localBrain.message, /token/i);
});

test("hybrid LLM provider falls back safely on malformed relay output", async () => {
  const client = createLlmClient({
    provider: "hybrid",
    autonomyMode: "approval",
    localRelayUrl: "https://local-brain.example",
    localRelayToken: "relay-secret",
    fetchImpl: async () => new Response("not json", { status: 200 }),
  });

  const decision = await client.decide<any>({
    agentName: "Research Agent",
    task: "Summarize market pulse",
    input: {},
  });

  assert.match(decision.summary, /mock decision/i);
  assert.equal(client.getStatus().localBrain.status, "fallback");
  assert.match(client.getStatus().localBrain.message, /local/i);
});

test("hybrid LLM provider falls back safely when the relay times out", async () => {
  const client = createLlmClient({
    provider: "hybrid",
    autonomyMode: "approval",
    localRelayUrl: "https://local-brain.example",
    localRelayToken: "relay-secret",
    localLlmTimeoutMs: 1,
    fetchImpl: async (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("relay timeout")));
      }),
  });

  const decision = await client.decide<any>({
    agentName: "Research Agent",
    task: "Summarize market pulse",
    input: {},
  });

  assert.match(decision.summary, /mock decision/i);
  assert.equal(client.getStatus().localBrain.status, "fallback");
  assert.match(client.getStatus().localBrain.message, /timeout/i);
});
