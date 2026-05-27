import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const host = process.env.LOCAL_LLM_RELAY_HOST ?? "127.0.0.1";
const port = Number(process.env.LOCAL_LLM_RELAY_PORT ?? 8787);
const relayToken = process.env.LOCAL_LLM_RELAY_TOKEN;
const ollamaBaseUrl = (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/+$/, "");
const configuredModel = process.env.LOCAL_LLM_MODEL ?? "auto";

if (!relayToken) {
  throw new Error("LOCAL_LLM_RELAY_TOKEN is required to run the local LLM relay.");
}

createServer((request, response) => {
  void handleRequest(request, response);
}).listen(port, host, () => {
  console.log(`LWT local LLM relay listening on http://${host}:${port}`);
});

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method === "GET" && request.url === "/healthz") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (!isAuthorized(request)) {
    sendJson(response, 401, { ok: false, error: "Unauthorized" });
    return;
  }

  if (request.method === "GET" && request.url === "/api/local-llm/status") {
    const models = await listOllamaModels();
    sendJson(response, 200, {
      ok: true,
      model: selectLocalModel(models, configuredModel),
      models,
    });
    return;
  }

  if (request.method === "POST" && request.url === "/api/local-llm/decide") {
    try {
      const body = await readJson(request);
      const models = await listOllamaModels();
      const model = selectLocalModel(models, String(body.model ?? configuredModel));
      if (!model) {
        sendJson(response, 503, { ok: false, error: "No local chat model is available" });
        return;
      }
      const decision = await askOllama(model, body);
      sendJson(response, 200, { ok: true, model, decision });
    } catch (error) {
      sendJson(response, 500, { ok: false, error: error instanceof Error ? error.message : "Local relay failed" });
    }
    return;
  }

  sendJson(response, 404, { ok: false, error: "Not found" });
}

async function askOllama(model: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(`${ollamaBaseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      format: "json",
      messages: [
        {
          role: "system",
          content:
            "You are the local intelligence layer for Living Well Today. Return only valid JSON. Improve explanations and drafts, but never execute Shopify writes, send emails, delete products, or bypass approvals.",
        },
        {
          role: "user",
          content: JSON.stringify({
            agentName: body.agentName,
            task: body.task,
            dataScope: body.dataScope,
            input: body.input,
            schema: body.schema,
          }),
        },
      ],
      options: {
        temperature: 0.3,
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`Ollama returned ${response.status}`);
  }
  const ollama = (await response.json()) as { message?: { content?: string } };
  const content = ollama.message?.content ?? "";
  const decision = JSON.parse(content) as Record<string, unknown>;
  if (!decision || typeof decision !== "object" || Array.isArray(decision)) {
    throw new Error("Ollama returned malformed JSON");
  }
  return decision;
}

async function listOllamaModels(): Promise<string[]> {
  const response = await fetch(`${ollamaBaseUrl}/api/tags`);
  if (!response.ok) {
    return [];
  }
  const body = (await response.json()) as { models?: Array<{ name?: string; model?: string }> };
  return (body.models ?? []).map((model) => model.name ?? model.model ?? "").filter(Boolean);
}

export function selectLocalModel(models: string[], requested = "auto"): string | null {
  if (requested && requested !== "auto" && models.includes(requested)) {
    return requested;
  }
  const chatModels = models.filter((model) => !/embed|embedding|nomic/i.test(model));
  const preferred = ["qwen3", "llama3.2", "llama3.1", "llama3", "mistral", "gemma3", "gemma", "phi4", "phi3"];
  for (const prefix of preferred) {
    const match = chatModels.find((model) => model.toLowerCase().startsWith(prefix));
    if (match) return match;
  }
  return chatModels[0] ?? null;
}

function isAuthorized(request: IncomingMessage): boolean {
  return request.headers.authorization === `Bearer ${relayToken}`;
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}
