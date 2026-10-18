import type { Browser } from "playwright";
import { launchSupplierBrowser } from "./browser-launcher.ts";

const LOGIN = "https://www.emersonecologics.com/login";
const PROTOCOL = "emerson_public_login_observation_v1" as const;
const WIDTH = 960, HEIGHT = 720;
export const PUBLIC_LOGIN_IMAGE_LIMIT = 400 * 1024; // Encoded bytes, not just decoded PNG size.
const PNG = Buffer.from("89504e470d0a1a0a", "hex");
type Reason = "browser_unavailable" | "navigation_unavailable" | "unexpected_navigation" | "observation_timeout" | "screenshot_unavailable" | "image_too_large";
const NO_AUTHORITY = { credentialsUsed: false, cookiesInjected: false, interactionPerformed: false, accountAccessed: false,
  orderSubmitted: false, paymentSubmitted: false } as const;
export type EmersonPublicLoginObservation = { protocolVersion: typeof PROTOCOL; observedAt: string } & typeof NO_AUTHORITY & (
  { status: "unavailable"; reason: Reason } | { status: "observed"; pageKind: "login";
    blockedWriteRequestCount: number; blockedSensitiveRequestCount: number;
    screenshot: { mimeType: "image/png"; base64: string; bytes: number; width: 960; height: 720 } }
);
const unavailable = (reason: Reason): EmersonPublicLoginObservation => ({ protocolVersion: PROTOCOL, observedAt: new Date().toISOString(),
  status: "unavailable", reason, ...NO_AUTHORITY });

export function emersonPublicLoginRequestAllowed(value: string, method: string, mainNavigation: boolean): boolean {
  let url: URL;
  try { url = new URL(value); } catch { return false; }
  if (url.protocol !== "https:" || !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())
    || /\/(?:account|cart|checkout|orders?|payments?|pay|logout)(?:\/|$)/i.test(url.pathname)) return false;
  return !mainNavigation || (!url.username && !url.password && ["emersonecologics.com", "www.emersonecologics.com"].includes(url.hostname)
    && /^\/login\/?$/.test(url.pathname));
}

/** Fixed anonymous public-page observation. Never loads stored credentials, sessions, or user browser state. */
export async function observePublicEmersonLogin(options: { launchBrowser?: () => Promise<Browser> } = {}): Promise<EmersonPublicLoginObservation> {
  let browser: Browser;
  try { browser = await (options.launchBrowser ?? launchSupplierBrowser)(); }
  catch { return unavailable("browser_unavailable"); }
  let reason: Reason = "navigation_unavailable", unexpectedNavigation = false;
  let blockedWriteRequestCount = 0, blockedSensitiveRequestCount = 0;
  try {
    const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1,
      serviceWorkers: "block", acceptDownloads: false });
    await context.route("**/*", async route => {
      const request = route.request(), mainNavigation = request.isNavigationRequest() && request.frame().parentFrame() === null;
      if (!emersonPublicLoginRequestAllowed(request.url(), request.method(), mainNavigation)) {
        if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) blockedWriteRequestCount = Math.min(999, blockedWriteRequestCount + 1);
        else blockedSensitiveRequestCount = Math.min(999, blockedSensitiveRequestCount + 1);
        if (mainNavigation) unexpectedNavigation = true;
        return route.abort("blockedbyclient");
      }
      return route.continue();
    });
    const page = await context.newPage();
    await page.goto(LOGIN, { waitUntil: "domcontentloaded", timeout: 20_000 });
    if (!emersonPublicLoginRequestAllowed(page.url(), "GET", true) || unexpectedNavigation) return unavailable("unexpected_navigation");
    reason = "observation_timeout";
    await page.getByRole("button", { name: /^Sign\s*in$/i }).waitFor({ state: "visible", timeout: 10_000 }).catch(() => undefined);
    await page.waitForTimeout(5_000); // Observe late public consent UI without causing any interaction.
    if (!emersonPublicLoginRequestAllowed(page.url(), "GET", true) || unexpectedNavigation) return unavailable("unexpected_navigation");
    reason = "screenshot_unavailable";
    const png = await page.screenshot({ type: "png", fullPage: false, animations: "disabled", scale: "css", timeout: 15_000 });
    if (!emersonPublicLoginRequestAllowed(page.url(), "GET", true) || unexpectedNavigation) return unavailable("unexpected_navigation");
    const base64 = png.toString("base64");
    if (base64.length > PUBLIC_LOGIN_IMAGE_LIMIT) return unavailable("image_too_large");
    return projectPublicLoginObservation({ protocolVersion: PROTOCOL, observedAt: new Date().toISOString(), status: "observed", pageKind: "login",
      blockedWriteRequestCount, blockedSensitiveRequestCount,
      screenshot: { mimeType: "image/png", base64, bytes: png.length, width: WIDTH, height: HEIGHT }, ...NO_AUTHORITY });
  } catch { return unavailable(unexpectedNavigation ? "unexpected_navigation" : reason); }
  finally { await browser.close().catch(() => undefined); }
}

/** Explicit bounded projection. No raw provider error, URL, cookie, field value, or extra helper field can leave the route. */
export function projectPublicLoginObservation(value: EmersonPublicLoginObservation): EmersonPublicLoginObservation {
  const r = value, reasons: Reason[] = ["browser_unavailable", "navigation_unavailable", "unexpected_navigation", "observation_timeout", "screenshot_unavailable", "image_too_large"];
  if (r.protocolVersion !== PROTOCOL || !Number.isFinite(Date.parse(r.observedAt)) || Object.entries(NO_AUTHORITY).some(([key]) => r[key as keyof typeof NO_AUTHORITY] !== false)) return unavailable("observation_timeout");
  const base = { protocolVersion: PROTOCOL, observedAt: r.observedAt, ...NO_AUTHORITY };
  if (r.status === "unavailable") return { ...base, status: "unavailable", reason: reasons.includes(r.reason) ? r.reason : "observation_timeout" };
  const image = r.screenshot;
  const count = (n: number, max: number) => Number.isSafeInteger(n) && n >= 0 && n <= max;
  if (r.status !== "observed" || r.pageKind !== "login" || !image || image.mimeType !== "image/png" || image.width !== WIDTH || image.height !== HEIGHT
    || typeof image.base64 !== "string" || image.base64.length > PUBLIC_LOGIN_IMAGE_LIMIT || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.base64)) return unavailable("screenshot_unavailable");
  const png = Buffer.from(image.base64, "base64");
  if (png.length !== image.bytes || png.length < 24 || !png.subarray(0, 8).equals(PNG) || png.readUInt32BE(16) !== WIDTH || png.readUInt32BE(20) !== HEIGHT
    || png.toString("base64") !== image.base64 || !count(r.blockedWriteRequestCount, 999) || !count(r.blockedSensitiveRequestCount, 999)) return unavailable("observation_timeout");
  return { ...base, status: "observed", pageKind: "login", screenshot: { mimeType: "image/png", base64: image.base64, bytes: png.length, width: WIDTH, height: HEIGHT },
    blockedWriteRequestCount: r.blockedWriteRequestCount, blockedSensitiveRequestCount: r.blockedSensitiveRequestCount };
}
