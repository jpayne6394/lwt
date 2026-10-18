import assert from "node:assert/strict";
import test from "node:test";
import type { Browser } from "playwright";
import { observePublicEmersonLogin, emersonPublicLoginRequestAllowed, projectPublicLoginObservation,
  PUBLIC_LOGIN_IMAGE_LIMIT, type EmersonPublicLoginObservation } from "../src/suppliers/emerson-public-login-observer.ts";
import { startServer, type ServerContext } from "../src/server/server.ts";
import { MemoryRepository } from "../src/storage/memory-repository.ts";
import { AlertService } from "../src/alerts/alert-service.ts";

function image(bytes = 24) {
  const png = Buffer.alloc(bytes); Buffer.from("89504e470d0a1a0a", "hex").copy(png);
  png.writeUInt32BE(960, 16); png.writeUInt32BE(720, 20); return png;
}
const fixture: EmersonPublicLoginObservation = { protocolVersion: "emerson_public_login_observation_v1", observedAt: "2026-10-18T15:00:00.000Z",
  status: "observed", pageKind: "login", blockedWriteRequestCount: 0, blockedSensitiveRequestCount: 0,
  screenshot: { mimeType: "image/png", base64: image().toString("base64"), bytes: 24, width: 960, height: 720 },
  credentialsUsed: false, cookiesInjected: false, interactionPerformed: false, accountAccessed: false, orderSubmitted: false, paymentSubmitted: false };

function browserHarness(options: { redirected?: string; screenshotFailure?: boolean; screenshotError?: Error; screenshotPending?: () => void; oversize?: boolean; axFailure?: boolean; axNodes?: unknown[] } = {}) {
  const events: string[] = [];
  const page = { goto: async (url: string, settings: unknown) => { assert.equal(url, "https://www.emersonecologics.com/login");
      assert.deepEqual(settings, { waitUntil: "domcontentloaded", timeout: 20_000 }); events.push("public-login"); },
    url: () => options.redirected ?? "https://www.emersonecologics.com/login",
    getByRole: (role: string, settings: { name: RegExp }) => { assert.equal(role, "button"); assert(settings.name.test("Sign in"));
      return { waitFor: async () => { events.push("observe-visible-form"); } }; },
    waitForTimeout: async (ms: number) => { assert.equal(ms, 5_000); events.push("observe-late-public-ui"); },
    // No screenshot, evaluate, click, fill, press, cookie or storage APIs exist in this harness.
  };
  const browser = { newContext: async (settings: unknown) => {
    assert.deepEqual(settings, { viewport: { width: 960, height: 720 }, deviceScaleFactor: 1, serviceWorkers: "block", acceptDownloads: false });
    events.push("fresh-anonymous-context");
    return { route: async (pattern: string) => { assert.equal(pattern, "**/*"); events.push("read-only-guard"); }, newPage: async () => page,
      newCDPSession: async (target: unknown) => { assert.equal(target, page); events.push("cdp-session"); return {
        send: async (command: string, settings?: unknown) => {
          if (command === "Page.captureScreenshot") {
            assert.deepEqual(settings, { format: "png", fromSurface: true, captureBeyondViewport: false, clip: { x: 0, y: 0, width: 960, height: 720, scale: 1 } });
            events.push("protocol-screenshot");
            if (options.screenshotPending) { options.screenshotPending(); return new Promise(() => undefined); }
            if (options.screenshotError) throw options.screenshotError;
            if (options.screenshotFailure) throw new Error("private credential provider message");
            return { data: image(options.oversize ? PUBLIC_LOGIN_IMAGE_LIMIT : 24).toString("base64") };
          }
          assert.equal(command, "Accessibility.getFullAXTree"); assert.equal(settings, undefined); events.push("protocol-accessibility");
          if (options.axFailure) throw new Error("private accessibility provider message");
          return { nodes: options.axNodes ?? [{ role: { value: "button" }, name: { value: "Reject optional cookies" }, value: { value: "private input value" } }] };
        }, detach: async () => { events.push("detached"); }
      }; }
    };
  }, close: async () => { events.push("closed"); } } as unknown as Browser;
  return { events, launch: async () => browser };
}

test("fixed public observation uses only browser-protocol screenshot in a fresh context, never credentials, DOM evaluation or interaction", async () => {
  const harness = browserHarness(), result = await observePublicEmersonLogin({ launchBrowser: harness.launch });
  assert.equal(result.status, "observed"); assert.equal(result.credentialsUsed, false); assert.equal(result.cookiesInjected, false);
  assert.equal(result.interactionPerformed, false); assert.equal(result.accountAccessed, false); assert.equal(result.orderSubmitted, false); assert.equal(result.paymentSubmitted, false);
  assert.deepEqual(harness.events, ["fresh-anonymous-context", "read-only-guard", "public-login", "observe-visible-form", "observe-late-public-ui", "cdp-session", "protocol-screenshot", "detached", "closed"]);
});
test("public observation blocks account navigation and all network writes, with bounded closed failures", async () => {
  assert.equal(emersonPublicLoginRequestAllowed("https://www.emersonecologics.com/login", "GET", true), true);
  assert.equal(emersonPublicLoginRequestAllowed("https://cdn.example.test/public.css", "GET", false), true);
  for (const [url, method, main] of [["https://evil.test/login", "GET", true], ["https://www.emersonecologics.com/account", "GET", true],
    ["https://www.emersonecologics.com/login", "POST", false], ["https://www.emersonecologics.com/checkout", "GET", false],
    ["http://www.emersonecologics.com/login", "GET", true]] as const) assert.equal(emersonPublicLoginRequestAllowed(url, method, main), false);
  for (const options of [{ redirected: "https://www.emersonecologics.com/account" }, { screenshotFailure: true, axFailure: true }, { oversize: true, axFailure: true }]) {
    const harness = browserHarness(options), result = await observePublicEmersonLogin({ launchBrowser: harness.launch });
    assert.equal(result.status, "unavailable"); assert.equal(harness.events.at(-1), "closed");
    assert.doesNotMatch(JSON.stringify(result), /private|credential provider|https:|base64/);
  }
});

test("failed screenshot falls back to at most 80 public role/name captions, never input values, properties or node IDs", async () => {
  const axNodes = [{ role: { value: "textbox" }, name: { value: "Email" }, value: { value: "private-input-sentinel" }, properties: [{ value: "private-property-sentinel" }], nodeId: "private-node-sentinel" },
    { ignored: true, role: { value: "button" }, name: { value: "ignored-sentinel" } },
    ...Array.from({ length: 100 }, (_, index) => ({ role: { value: "button" }, name: { value: `${index} ${"x".repeat(300)}` } }))];
  const harness = browserHarness({ screenshotFailure: true, axNodes }), result = await observePublicEmersonLogin({ launchBrowser: harness.launch });
  assert.equal(result.status, "observed"); if (result.status !== "observed") assert.fail();
  assert.equal(result.screenshot, undefined); assert.equal(result.screenshotErrorCategory, "other"); assert.equal(result.accessibility?.length, 80);
  assert.deepEqual(result.accessibility?.[0], { role: "textbox", name: "Email" });
  assert(result.accessibility?.every(node => node.name.length <= 200));
  assert.doesNotMatch(JSON.stringify(result), /private-|sentinel|nodeId|properties/);
  assert.deepEqual(harness.events.slice(-3), ["protocol-accessibility", "detached", "closed"]);
});

test("protocol failures return only closed screenshot categories and still detach and close", async () => {
  for (const [error, category] of [
    [Object.assign(new Error("private timeout detail"), { name: "TimeoutError" }), "timeout"],
    [Object.assign(new Error("private crash detail"), { name: "TargetClosedError" }), "browser_closed"],
    [Object.assign(new Error("private protocol detail"), { name: "ProtocolError" }), "protocol_error"],
    [Object.assign(new Error("private arbitrary detail"), { name: "SecretErrorName" }), "other"]
  ] as const) {
    const harness = browserHarness({ screenshotError: error, axFailure: true }), result = await observePublicEmersonLogin({ launchBrowser: harness.launch });
    assert.equal(result.status, "unavailable"); assert.equal(result.screenshotErrorCategory, category);
    assert.doesNotMatch(JSON.stringify(result), /private|SecretErrorName|detail/);
    assert.deepEqual(harness.events.slice(-2), ["detached", "closed"]);
  }
});

test("an unresolved CDP capture reaches its 15-second deadline and falls back without waiting for page JavaScript", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const harness = browserHarness({ screenshotPending: started }), pending = observePublicEmersonLogin({ launchBrowser: harness.launch });
  await ready; t.mock.timers.tick(15_000);
  const result = await pending;
  assert.equal(result.status, "observed"); assert.equal(result.screenshotErrorCategory, "timeout");
  assert.deepEqual(harness.events.slice(-3), ["protocol-accessibility", "detached", "closed"]);
});
test("bounded projection strips extra helper data and rejects malformed or oversized images and authority claims", () => {
  assert.doesNotMatch(JSON.stringify(projectPublicLoginObservation({ ...fixture, secret: "private" } as EmersonPublicLoginObservation)), /private|secret/);
  assert.equal(projectPublicLoginObservation({ ...fixture, credentialsUsed: true } as unknown as EmersonPublicLoginObservation).status, "unavailable");
  if (fixture.status !== "observed") assert.fail();
  assert(fixture.screenshot);
  assert.equal(projectPublicLoginObservation({ ...fixture, screenshot: { ...fixture.screenshot, base64: "x".repeat(PUBLIC_LOGIN_IMAGE_LIMIT + 1) } }).status, "unavailable");
  const fallback = { ...fixture, screenshot: undefined, screenshotErrorCategory: "timeout" as const,
    accessibility: [{ role: "button", name: "Reject all", value: "private" }] };
  assert.doesNotMatch(JSON.stringify(projectPublicLoginObservation(fallback)), /private|value/);
  assert.equal(projectPublicLoginObservation({ ...fallback, screenshotErrorCategory: "raw private error" } as unknown as EmersonPublicLoginObservation).status, "unavailable");
  assert.equal(projectPublicLoginObservation({ ...fallback, accessibility: Array.from({ length: 81 }, () => ({ role: "button", name: "Reject all" })) }).status, "unavailable");
  assert.equal(projectPublicLoginObservation({ ...fallback, accessibility: [{ role: "button", name: "x".repeat(201) }] }).status, "unavailable");
});

const token = "p".repeat(48), read = "r".repeat(48), run = "u".repeat(48);
async function withServer(overrides: Partial<ServerContext>, use: (base: string) => Promise<void>) {
  const server = startServer({ repository: new MemoryRepository(), suppliers: [], alerts: new AlertService(), runNow: async () => assert.fail("no worker action"),
    checkSupplierAuthentication: async () => assert.fail("no stored authentication"), supplierCartPrepareToken: token, supplierReadToken: read, supplierRunToken: run,
    ...overrides }, { port: 0, host: "127.0.0.1" });
  await new Promise<void>(resolve => server.once("listening", resolve)); const address = server.address(); assert(address && typeof address === "object");
  try { await use(`http://127.0.0.1:${address.port}`); } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}
const invoke = (base: string, body: unknown = {}, authorization = token, query = "") => fetch(`${base}/api/suppliers/emerson-login-observation${query}`, {
  method: "POST", headers: { authorization: `Bearer ${authorization}`, "content-type": "application/json" }, body: JSON.stringify(body) });

test("only build token and empty fixed arguments may observe; failures do not consume unauthenticated quota", async () => {
  let calls = 0;
  await withServer({ observePublicEmersonLogin: async () => { calls++; return fixture; } }, async base => {
    assert.equal((await invoke(base, {}, read)).status, 401); assert.equal((await invoke(base, {}, run)).status, 401);
    assert.equal((await invoke(base, { url: "https://evil.test" })).status, 400);
    assert.equal((await invoke(base, {}, token, "?url=evil")).status, 400); assert.equal(calls, 0);
    const result = await invoke(base); assert.equal(result.status, 200); assert.equal(result.headers.get("cache-control"), "no-store");
    assert.equal((await result.json()).status, "observed"); assert.equal(calls, 1);
    const duplicate = await invoke(base); assert.equal(duplicate.status, 429); assert.equal(duplicate.headers.get("retry-after"), "60"); assert.equal(calls, 1);
  });
  await withServer({ supplierCartPrepareToken: read, observePublicEmersonLogin: async () => assert.fail("token alias forbidden") }, async base => {
    assert.equal((await invoke(base, {}, read)).status, 503);
  });
});
test("one active public observation is permitted and a failed attempt is still rate-limited", async () => {
  let release!: () => void, entered!: () => void;
  const begun = new Promise<void>(resolve => { entered = resolve; });
  await withServer({ observePublicEmersonLogin: async () => { entered(); await new Promise<void>(resolve => { release = resolve; }); return fixture; } }, async base => {
    const first = invoke(base); await begun; assert.equal((await invoke(base)).status, 429); release(); assert.equal((await first).status, 200);
  });
  await withServer({ observePublicEmersonLogin: async () => { throw new Error("private cookie credential"); } }, async base => {
    const failed = await invoke(base); assert.equal(failed.status, 503); assert.doesNotMatch(await failed.text(), /private|cookie|credential/);
    assert.equal((await invoke(base)).status, 429);
  });
});
