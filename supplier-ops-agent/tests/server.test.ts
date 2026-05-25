import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { AlertService } from "../src/alerts/alert-service.ts";
import { startServer } from "../src/server/server.ts";
import { MemoryRepository } from "../src/storage/memory-repository.ts";

test("server forces manual write run requests into dry-run when apply changes is disabled", async () => {
  let requestedDryRun: boolean | undefined;
  const server = startServer(
    {
      repository: new MemoryRepository(),
      suppliers: [],
      alerts: new AlertService(),
      runNow: async () => {},
      startRun: (dryRun) => {
        requestedDryRun = dryRun;
        return true;
      },
      shopifyApiKey: "test-key",
      applyChangesEnabled: false,
    },
    { port: 0, host: "127.0.0.1" },
  );

  await onceListening(server);
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/runs`, {
      method: "POST",
      headers: { accept: "application/json" },
    });
    const body = (await response.json()) as { dryRun: boolean; applyChangesEnabled: boolean };

    assert.equal(response.status, 202);
    assert.equal(requestedDryRun, true);
    assert.equal(body.dryRun, true);
    assert.equal(body.applyChangesEnabled, false);
  } finally {
    server.close();
  }
});

test("server allows manual write run requests when apply changes is enabled", async () => {
  let requestedDryRun: boolean | undefined;
  const server = startServer(
    {
      repository: new MemoryRepository(),
      suppliers: [],
      alerts: new AlertService(),
      runNow: async () => {},
      startRun: (dryRun) => {
        requestedDryRun = dryRun;
        return true;
      },
      shopifyApiKey: "test-key",
      applyChangesEnabled: true,
    },
    { port: 0, host: "127.0.0.1" },
  );

  await onceListening(server);
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/runs`, {
      method: "POST",
      headers: { accept: "application/json" },
    });
    const body = (await response.json()) as { dryRun: boolean; applyChangesEnabled: boolean };

    assert.equal(response.status, 202);
    assert.equal(requestedDryRun, false);
    assert.equal(body.dryRun, false);
    assert.equal(body.applyChangesEnabled, true);
  } finally {
    server.close();
  }
});

function onceListening(server: ReturnType<typeof startServer>): Promise<void> {
  if (server.listening) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    server.once("listening", resolve);
  });
}
