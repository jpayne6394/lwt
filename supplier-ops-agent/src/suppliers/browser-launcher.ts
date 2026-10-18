import type { Browser } from "playwright";

export type SupplierBrowserMode = "managed" | "portable";
type BrowserLaunchStage = "queue" | "load_playwright" | "load_portable" | "extract_portable" | "launch";
export type BrowserLaunchFailure = "busy" | "timeout" | "binary_busy" | "binary_missing" | "permission_denied"
  | "missing_dependency" | "resource_unavailable" | "browser_closed" | "other";

export class SupplierBrowserLaunchError extends Error {
  readonly stage: BrowserLaunchStage;
  readonly category: BrowserLaunchFailure;
  constructor(stage: BrowserLaunchStage, category: BrowserLaunchFailure) {
    super(`Supplier browser startup failed (${stage}/${category})`);
    this.name = "SupplierBrowserLaunchError";
    this.stage = stage;
    this.category = category;
  }
}

/** The original launch error may contain process arguments or URLs; only this closed category is emitted. */
export function browserLaunchFailure(error: unknown): BrowserLaunchFailure {
  if (!(error instanceof Error)) return "other";
  const code = "code" in error ? error.code : undefined;
  if (code === "ETXTBSY" || /text file busy/i.test(error.message)) return "binary_busy";
  if (code === "ENOENT" || /executable.*does(?:n.t| not) exist|input directory.*does not exist/i.test(error.message)) return "binary_missing";
  if (code === "EACCES" || /permission denied/i.test(error.message)) return "permission_denied";
  if (code === "ERR_MODULE_NOT_FOUND" || /cannot find (?:module|package)|error while loading shared libraries/i.test(error.message)) return "missing_dependency";
  if (["ENOMEM", "EAGAIN", "ENOSPC"].includes(String(code)) || /out of memory|cannot allocate memory|insufficient resources/i.test(error.message)) return "resource_unavailable";
  if (error.name === "TimeoutError" || /timed? out|timeout/i.test(error.message)) return "timeout";
  if (/target.*closed|browser.*closed|browser.*exited|process.*exited/i.test(error.message)) return "browser_closed";
  return "other";
}

function startupFailure(stage: BrowserLaunchStage, error: unknown): SupplierBrowserLaunchError {
  const failure = error instanceof SupplierBrowserLaunchError ? error : new SupplierBrowserLaunchError(stage, browserLaunchFailure(error));
  console.warn("[supplier-browser] startup failed", { stage: failure.stage, category: failure.category,
    mode: supplierBrowserMode(), platform: process.platform, architecture: process.arch });
  return failure;
}

export function supplierBrowserMode(platform = process.platform): SupplierBrowserMode {
  return platform === "linux" ? "portable" : "managed";
}

/** One browser process at a time, including startup prewarming; callers retain isolated contexts. */
export function createSerializedSupplierBrowserLauncher(launch: () => Promise<Browser>, queueTimeoutMs = 45_000): () => Promise<Browser> {
  let previous = Promise.resolve();
  return async () => {
    let release!: () => void;
    const available = previous;
    const occupied = new Promise<void>((resolve) => { release = resolve; });
    previous = available.then(() => occupied);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([available, new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new SupplierBrowserLaunchError("queue", "busy")), queueTimeoutMs);
      })]);
    } catch (error) {
      release();
      throw startupFailure("queue", error);
    } finally { clearTimeout(timeout); }
    let browser: Browser;
    try { browser = await launch(); }
    catch (error) { release(); throw error; }
    let closing: Promise<void> | undefined;
    let closeStarted = false;
    let closeSettled = false;
    // A crashed process must not permanently hold the queue; ordinary close waits for actual cleanup.
    browser.once("disconnected", () => { if (!closeStarted || closeSettled) release(); });
    return new Proxy(browser, { get(target, property) {
      if (property === "close") return (...args: Parameters<Browser["close"]>) => {
        if (!closing) {
          closeStarted = true;
          closing = (async () => {
            try { await target.close(...args); }
            finally { closeSettled = true; if (!target.isConnected()) release(); }
          })();
        }
        return closing;
      };
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    } });
  };
}

async function launchBrowserProcess(): Promise<Browser> {
  let stage: BrowserLaunchStage = "load_playwright";
  try {
    const { chromium: playwrightChromium } = await import("playwright");
    if (supplierBrowserMode() === "managed") {
      stage = "launch";
      return await playwrightChromium.launch({ headless: true, timeout: 45_000 });
    }
    stage = "load_portable";
    const { default: portableChromium } = await import("@sparticuz/chromium");
    stage = "extract_portable";
    // Serialize the whole lifetime, not only this call: executablePath may see another extraction's partial file.
    const executablePath = await portableChromium.executablePath();
    stage = "launch";
    return await playwrightChromium.launch({ args: portableChromium.args, executablePath, headless: true, timeout: 45_000 });
  } catch (error) {
    throw startupFailure(stage, error);
  }
}

const serializedLaunch = createSerializedSupplierBrowserLauncher(launchBrowserProcess);
export async function launchSupplierBrowser(): Promise<Browser> { return serializedLaunch(); }

/**
 * Extracts and starts the supplier browser so the first protected supplier
 * read does not have to pay the full portable-Chromium startup cost.
 */
export async function prewarmSupplierBrowser(
  launchBrowser: typeof launchSupplierBrowser = launchSupplierBrowser,
): Promise<void> {
  const browser = await launchBrowser();
  await browser.close();
}

/**
 * Starts browser prewarming without delaying the HTTP listener. Public catalog
 * reads do not use Chromium, so a slow or failed prewarm must not keep the
 * service unhealthy. Protected reads still launch the browser on demand.
 */
export function startSupplierBrowserPrewarm(
  launchBrowser: typeof launchSupplierBrowser = launchSupplierBrowser,
  onError: (error: unknown) => void = () => {
    console.warn("Supplier browser prewarm failed; protected reads will retry on demand.");
  },
): void {
  void prewarmSupplierBrowser(launchBrowser).catch(onError);
}
