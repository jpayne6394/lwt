import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import type { Browser } from "playwright";
import { browserLaunchFailure, createSerializedSupplierBrowserLauncher, prewarmSupplierBrowser, SupplierBrowserLaunchError } from "../src/suppliers/browser-launcher.ts";

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

class FakeBrowser extends EventEmitter {
  connected = true;
  closes = 0;
  readonly id: number;
  readonly closeGate: Promise<void>;
  readonly failClose: boolean;
  constructor(id: number, closeGate: Promise<void> = Promise.resolve(), failClose = false) {
    super(); this.id = id; this.closeGate = closeGate; this.failClose = failClose;
  }
  isConnected() { return this.connected; }
  async newContext() { return { browserId: this.id }; }
  async close() {
    this.closes += 1;
    await this.closeGate;
    if (this.failClose) throw new Error("private-provider-close-context");
    this.connected = false;
    this.emit("disconnected");
  }
  crash() { this.connected = false; this.emit("disconnected"); }
}
const asBrowser = (browser: FakeBrowser) => browser as unknown as Browser;

test("supplier requests never run overlapping Chromium processes and bound methods retain the correct browser", async () => {
  const started: FakeBrowser[] = [];
  const launch = createSerializedSupplierBrowserLauncher(async () => {
    const browser = new FakeBrowser(started.length + 1); started.push(browser); return asBrowser(browser);
  });
  const first = await launch();
  const next = launch();
  await flush();
  assert.equal(started.length, 1);
  assert.deepEqual(await first.newContext(), { browserId: 1 });
  await first.close();
  const second = await next;
  assert.equal(started.length, 2);
  assert.deepEqual(await second.newContext(), { browserId: 2 });
  await second.close();
});

test("prewarming and a first request share the same limit until actual browser close finishes", async () => {
  let finishClose!: () => void;
  const closing = new Promise<void>((resolve) => { finishClose = resolve; });
  const started: FakeBrowser[] = [];
  const launch = createSerializedSupplierBrowserLauncher(async () => {
    const browser = new FakeBrowser(started.length + 1, started.length === 0 ? closing : Promise.resolve());
    started.push(browser); return asBrowser(browser);
  });
  const warm = prewarmSupplierBrowser(launch);
  const request = launch();
  await flush();
  assert.equal(started.length, 1);
  assert.equal(started[0].closes, 1);
  finishClose();
  await warm;
  const browser = await request;
  assert.equal(started.length, 2);
  await browser.close();
});

test("failed launch releases its slot and duplicate close calls do not close or release twice", async () => {
  let launches = 0;
  const started: FakeBrowser[] = [];
  const launch = createSerializedSupplierBrowserLauncher(async () => {
    launches += 1;
    if (launches === 1) throw new SupplierBrowserLaunchError("launch", "resource_unavailable");
    const browser = new FakeBrowser(launches); started.push(browser); return asBrowser(browser);
  });
  await assert.rejects(launch(), SupplierBrowserLaunchError);
  const first = await launch();
  await Promise.all([first.close(), first.close()]);
  assert.equal(started[0].closes, 1);
  const second = await launch();
  await second.close();
  assert.equal(launches, 3);
});

test("a bounded busy request never launches later or exposes raw provider data", async (context) => {
  const logs: unknown[][] = [];
  context.mock.method(console, "warn", (...args: unknown[]) => { logs.push(args); });
  let launched = 0;
  const launch = createSerializedSupplierBrowserLauncher(async () => asBrowser(new FakeBrowser(++launched)), 5);
  const active = await launch();
  await assert.rejects(launch(), (error: unknown) => error instanceof SupplierBrowserLaunchError && error.stage === "queue" && error.category === "busy");
  assert.equal(launched, 1);
  await active.close();
  const later = await launch();
  assert.equal(launched, 2);
  await later.close();
  assert.deepEqual((logs[0][1] as Record<string, unknown>).category, "busy");
  assert.doesNotMatch(JSON.stringify(logs), /private|cookie|password|https:|executablePath/);
});

test("an unexpected browser disconnect frees the slot without sharing its context", async () => {
  const started: FakeBrowser[] = [];
  const launch = createSerializedSupplierBrowserLauncher(async () => {
    const browser = new FakeBrowser(started.length + 1); started.push(browser); return asBrowser(browser);
  });
  await launch();
  const pending = launch();
  started[0].crash();
  const next = await pending;
  assert.equal(started.length, 2);
  assert.deepEqual(await next.newContext(), { browserId: 2 });
  await next.close();
});

test("a close failure cannot permit another process while the old browser is still connected", async (context) => {
  context.mock.method(console, "warn", () => undefined);
  const stuck = new FakeBrowser(1, Promise.resolve(), true);
  let launches = 0;
  const launch = createSerializedSupplierBrowserLauncher(async () => asBrowser(++launches === 1 ? stuck : new FakeBrowser(launches)), 5);
  const browser = await launch();
  await assert.rejects(browser.close());
  await assert.rejects(launch(), (error: unknown) => error instanceof SupplierBrowserLaunchError && error.category === "busy");
  assert.equal(launches, 1);
  stuck.crash();
  const recovered = await launch();
  assert.equal(launches, 2);
  await recovered.close();
});

test("startup diagnostics use only fixed categories, not original errors, paths or process arguments", () => {
  for (const [error, category] of [
    [Object.assign(new Error("private-cookie /private/chromium"), { code: "ETXTBSY" }), "binary_busy"],
    [Object.assign(new Error("private-password"), { code: "ENOENT" }), "binary_missing"],
    [Object.assign(new Error("private-password"), { code: "EACCES" }), "permission_denied"],
    [new Error("error while loading shared libraries: private-library.so"), "missing_dependency"],
    [Object.assign(new Error("private-account"), { code: "ENOMEM" }), "resource_unavailable"],
    [Object.assign(new Error("private-token"), { name: "TimeoutError" }), "timeout"],
    [new Error("Target browser has been closed private-cookie"), "browser_closed"],
    [new Error("private-provider-error"), "other"],
  ] as const) {
    assert.equal(browserLaunchFailure(error), category);
    assert.doesNotMatch(JSON.stringify(new SupplierBrowserLaunchError("launch", browserLaunchFailure(error))), /private|\.so|chromium\//);
  }
});
