import assert from "node:assert/strict";
import test from "node:test";
import { AlertService } from "../src/alerts/alert-service.ts";
import { startServer, type ServerContext } from "../src/server/server.ts";
import { MemoryRepository } from "../src/storage/memory-repository.ts";
import { describeSupplierAuthConfiguration } from "../src/suppliers/auth-diagnostics.ts";
import { EmersonCatalogSupplierAdapter } from "../src/suppliers/emerson-catalog-adapter.ts";
import { SUPPLIER_AUTH_ISSUES, SupplierAdapterError, type SupplierConfig } from "../src/suppliers/types.ts";

const supplier: SupplierConfig = { id: "emerson-ecologics", name: "Emerson Ecologics", mode: "website", brands: [], notes: "" };
const readToken = "r".repeat(40);
const runToken = "u".repeat(40);

test("diagnostics disclose presence only and report Emerson's stored-credential renewal support", () => {
  const result = describeSupplierAuthConfiguration(supplier, {
    SUPPLIER_COOKIE_EMERSON_ECOLOGICS: "private-cookie-material",
    SUPPLIER_USERNAME_EMERSON_ECOLOGICS: "private-account@example.test",
    SUPPLIER_PASSWORD_EMERSON_ECOLOGICS: "private-password-material",
  });
  assert.deepEqual(result, { supplierKey: supplier.id, mode: "supplier_account", usernameConfigured: true,
    passwordConfigured: true, sessionConfigured: true, automaticReauthenticationSupported: true,
    refreshedSessionPersistence: "process_memory_only" });
  assert.doesNotMatch(JSON.stringify(result), /private|example\.test/);
});

test("public supplier catalog readiness never implies account authentication", () => {
  const result = describeSupplierAuthConfiguration({ ...supplier, id: "physicians-standard" }, {
    SUPPLIER_USERNAME_PHYSICIANS_STANDARD: "private-user", SUPPLIER_PASSWORD_PHYSICIANS_STANDARD: "private-password",
  });
  assert.equal(result.mode, "public_catalog");
  assert.equal(result.automaticReauthenticationSupported, false);
});

test("only complete reviewed account settings can support automatic credential reauthentication", () => {
  const result = describeSupplierAuthConfiguration({ ...supplier, id: "desbio" }, {
    SUPPLIER_USERNAME_DESBIO: "private-user", SUPPLIER_PASSWORD_DESBIO: "private-password",
  });
  assert.equal(result.automaticReauthenticationSupported, true);
  assert.equal(result.refreshedSessionPersistence, "process_memory_only");
  assert.equal(describeSupplierAuthConfiguration(supplier, {}).automaticReauthenticationSupported, false);
});

test("Emerson authentication verifies the rendered account marker, not legacy public product state", async () => {
  let rendered = 0;
  const adapter = new EmersonCatalogSupplierAdapter(supplier, { cookieHeader: "private-cookie",
    fetchImpl: async () => { throw new Error("catalog-only fetch must not be used for authentication proof"); },
    renderCatalogImpl: async (url) => { rendered += 1; return { responseUrl: url, records: [] }; },
  });
  assert.equal((await adapter.verifyAuthentication()).status, "connected");
  assert.equal(rendered, 1);
  const challenged = new EmersonCatalogSupplierAdapter(supplier, { cookieHeader: "private-cookie",
    renderCatalogImpl: async () => { throw new SupplierAdapterError(supplier.id, "two_factor_required", "private account context"); },
  });
  const result = await challenged.verifyAuthentication();
  assert.equal(result.status, "two_factor_required");
  assert.equal(result.authIssue, "mfa_required");
  assert.doesNotMatch(JSON.stringify(result), /private/);
});

test("authentication reasons distinguish unconfigured, old-session and actual challenge states", async () => {
  assert.equal((await new EmersonCatalogSupplierAdapter(supplier).verifyAuthentication()).authIssue, "session_not_configured");
  for (const [failure, expected] of [
    [new Error("private-cookie"), "existing_session_unverified"],
    [new SupplierAdapterError(supplier.id, "verification_required", "private-page"), "challenge_required"],
    [new SupplierAdapterError(supplier.id, "two_factor_required", "private-page"), "mfa_required"],
  ] as const) {
    const adapter = new EmersonCatalogSupplierAdapter(supplier, { cookieHeader: "private-cookie",
      renderCatalogImpl: async () => { throw failure; } });
    const result = await adapter.verifyAuthentication();
    assert.equal(result.authIssue, expected);
    assert.doesNotMatch(JSON.stringify(result), /private/);
  }
});

async function withServer(context: Partial<ServerContext>, run: (url: string) => Promise<void>) {
  const server = startServer({ repository: new MemoryRepository(), suppliers: [supplier], alerts: new AlertService(),
    runNow: async () => { throw new Error("sync must never run"); }, supplierReadToken: readToken,
    supplierRunToken: runToken, ...context }, { port: 0, host: "127.0.0.1" });
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test("auth diagnostic requires the read token, one exact supplier, and never returns provider errors", async () => {
  let checks = 0;
  await withServer({ checkSupplierAuthentication: async () => { checks += 1; throw new Error("private-cookie-material"); } }, async (url) => {
    const invoke = (token: string, body: unknown) => fetch(`${url}/api/suppliers/auth-check`, { method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
    assert.equal((await invoke(runToken, { supplierKey: supplier.id })).status, 401);
    assert.equal((await invoke(readToken, { supplierKey: supplier.id, extra: true })).status, 400);
    assert.equal((await invoke(readToken, { supplierKey: "unconfigured-supplier" })).status, 400);
    assert.equal(checks, 0);
    const result = await invoke(readToken, { supplierKey: supplier.id });
    assert.equal(result.status, 502);
    assert.doesNotMatch(await result.text(), /private/);
    assert.equal(checks, 1);
  });
});

test("auth diagnostic reports exact account proof and keeps cart/payment/order unavailable", async () => {
  await withServer({ sourceRevision: "a".repeat(40), checkSupplierAuthentication: async () => ({
    configuration: describeSupplierAuthConfiguration(supplier, {}), status: "connected", accountAuthenticated: true,
    checkedAt: "2026-10-18T12:00:00.000Z",
  }) }, async (url) => {
    assert.deepEqual(await (await fetch(`${url}/healthz`)).json(), { ok: true, sourceRevision: "a".repeat(40) });
    const result = await fetch(`${url}/api/suppliers/auth-check`, { method: "POST", headers: {
      authorization: `Bearer ${readToken}`, "content-type": "application/json" }, body: JSON.stringify({ supplierKey: supplier.id }) });
    assert.equal(result.headers.get("cache-control"), "no-store");
    const data = await result.json();
    assert.equal(data.accountAuthenticated, true);
    assert.equal(data.remoteCartPreparationSupported, false);
    assert.equal(data.orderSubmissionSupported, false);
    assert.equal(data.paymentSupported, false);
  });
});

test("public liveness never echoes an invalid revision or claims supplier authentication", async () => {
  await withServer({ sourceRevision: "private-invalid-value" }, async (url) => {
    assert.deepEqual(await (await fetch(`${url}/healthz`)).json(), { ok: true, sourceRevision: null });
  });
});

test("protected auth diagnostics expose only the closed reason enum and never arbitrary provider fields", async () => {
  for (const authIssue of [...SUPPLIER_AUTH_ISSUES, "private-cookie https://private.invalid/account", 123, null]) {
    await withServer({ checkSupplierAuthentication: async () => ({
      configuration: describeSupplierAuthConfiguration(supplier, {}), status: "login_failed", accountAuthenticated: false,
      checkedAt: "2026-10-18T12:00:00.000Z", authIssue, message: "private-provider-password", accountId: "private-account",
    } as unknown as NonNullable<Awaited<ReturnType<NonNullable<ServerContext["checkSupplierAuthentication"]>>>>) }, async (url) => {
      const response = await fetch(`${url}/api/suppliers/auth-check`, { method: "POST", headers: {
        authorization: `Bearer ${readToken}`, "content-type": "application/json" }, body: JSON.stringify({ supplierKey: supplier.id }) });
      const data = await response.json();
      assert.equal(response.status, 200);
      assert.equal(data.authIssue, typeof authIssue === "string" && (SUPPLIER_AUTH_ISSUES as readonly string[]).includes(authIssue) ? authIssue : undefined);
      assert.doesNotMatch(JSON.stringify(data), /private|https:/);
      assert.equal(data.message, undefined);
      assert.equal(data.accountId, undefined);
    });
  }
});
