import type { Browser, CDPSession } from "playwright";
import { launchSupplierBrowser } from "./browser-launcher.ts";

const LOGIN = "https://www.emersonecologics.com/login";
const PROTOCOL = "emerson_public_login_observation_v1" as const;
const WIDTH = 960, HEIGHT = 720;
export const PUBLIC_LOGIN_IMAGE_LIMIT = 400 * 1024; // Encoded bytes, not just decoded PNG size.
const PNG = Buffer.from("89504e470d0a1a0a", "hex");
type Reason = "browser_unavailable" | "navigation_unavailable" | "unexpected_navigation" | "observation_timeout" | "screenshot_unavailable" | "image_too_large";
type ScreenshotErrorCategory = "timeout" | "browser_closed" | "protocol_error" | "image_too_large" | "invalid_image" | "other";
type PublicCaption = { role: string; name: string };
type PublicImage = { mimeType: "image/png"; base64: string; bytes: number; width: 960; height: 720 };
const SCREENSHOT_ERRORS: ScreenshotErrorCategory[] = ["timeout", "browser_closed", "protocol_error", "image_too_large", "invalid_image", "other"];
const NO_AUTHORITY = { credentialsUsed: false, cookiesInjected: false, interactionPerformed: false, accountAccessed: false,
  orderSubmitted: false, paymentSubmitted: false } as const;
export type EmersonPublicLoginObservation = { protocolVersion: typeof PROTOCOL; observedAt: string;
  screenshotErrorCategory?: ScreenshotErrorCategory } & typeof NO_AUTHORITY & (
  { status: "unavailable"; reason: Reason } | { status: "observed"; pageKind: "login";
    blockedWriteRequestCount: number; blockedSensitiveRequestCount: number;
    screenshot?: PublicImage; accessibility?: PublicCaption[] }
);
const unavailable = (reason: Reason, screenshotErrorCategory?: ScreenshotErrorCategory): EmersonPublicLoginObservation => ({ protocolVersion: PROTOCOL, observedAt: new Date().toISOString(),
  status: "unavailable", reason, ...(screenshotErrorCategory ? { screenshotErrorCategory } : {}), ...NO_AUTHORITY });

async function bounded<T>(operation: Promise<T>, timeout = 15_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([operation, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error("public observation deadline"), { name: "TimeoutError" })), timeout);
  })]); } finally { clearTimeout(timer); }
}
function screenshotError(error: unknown): ScreenshotErrorCategory {
  const name = error instanceof Error ? error.name : "", message = error instanceof Error ? error.message : "";
  if (name === "TimeoutError") return "timeout";
  if (name === "TargetClosedError" || /(?:target|browser|session|connection).*(?:closed|crashed|disconnected)/i.test(message)) return "browser_closed";
  return name === "ProtocolError" || /protocol error/i.test(message) ? "protocol_error" : "other";
}
function publicCaptions(value: unknown): PublicCaption[] {
  if (!Array.isArray(value)) return [];
  return value.filter(node => node && !node.ignored && typeof node.role?.value === "string" && typeof node.name?.value === "string")
    .map(node => ({ role: node.role.value, name: node.name.value.trim().replace(/\s+/g, " ").slice(0, 200) }))
    .filter(node => /^[A-Za-z][A-Za-z0-9 ]{0,39}$/.test(node.role) && node.name).slice(0, 80);
}
function publicImage(base64: unknown): PublicImage | undefined {
  if (typeof base64 !== "string" || base64.length > PUBLIC_LOGIN_IMAGE_LIMIT || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return;
  const png = Buffer.from(base64, "base64");
  if (png.length < 24 || !png.subarray(0, 8).equals(PNG) || png.readUInt32BE(16) !== WIDTH || png.readUInt32BE(20) !== HEIGHT || png.toString("base64") !== base64) return;
  return { mimeType: "image/png", base64, bytes: png.length, width: WIDTH, height: HEIGHT };
}

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
  let session: CDPSession | undefined, screenshotErrorCategory: ScreenshotErrorCategory | undefined;
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
    session = await bounded(context.newCDPSession(page));
    let screenshot: PublicImage | undefined, accessibility: PublicCaption[] | undefined;
    try {
      // Browser-protocol capture avoids Playwright's page/font/animation readiness work.
      const capture = await bounded(session.send("Page.captureScreenshot", { format: "png", fromSurface: true,
        captureBeyondViewport: false, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: 1 } }));
      screenshot = publicImage(capture.data);
      if (!screenshot) screenshotErrorCategory = capture.data.length > PUBLIC_LOGIN_IMAGE_LIMIT ? "image_too_large" : "invalid_image";
    } catch (error) { screenshotErrorCategory = screenshotError(error); }
    if (!screenshot) {
      // Only public role/name captions leave this fresh anonymous context; AX values/properties/IDs do not.
      try { accessibility = publicCaptions((await bounded(session.send("Accessibility.getFullAXTree"))).nodes); } catch { /* Closed failure below. */ }
    }
    if (!emersonPublicLoginRequestAllowed(page.url(), "GET", true) || unexpectedNavigation) return unavailable("unexpected_navigation");
    if (!screenshot && !accessibility?.length) return unavailable(screenshotErrorCategory === "image_too_large" ? "image_too_large" : "screenshot_unavailable", screenshotErrorCategory);
    return projectPublicLoginObservation({ protocolVersion: PROTOCOL, observedAt: new Date().toISOString(), status: "observed", pageKind: "login",
      blockedWriteRequestCount, blockedSensitiveRequestCount,
      ...(screenshot ? { screenshot } : { accessibility, screenshotErrorCategory }), ...NO_AUTHORITY });
  } catch (error) { return unavailable(unexpectedNavigation ? "unexpected_navigation" : reason,
    reason === "screenshot_unavailable" ? screenshotErrorCategory ?? screenshotError(error) : undefined); }
  finally {
    if (session) await bounded(session.detach(), 2_000).catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

/** Explicit bounded projection. No raw provider error, URL, cookie, field value, or extra helper field can leave the route. */
export function projectPublicLoginObservation(value: EmersonPublicLoginObservation): EmersonPublicLoginObservation {
  const r = value, reasons: Reason[] = ["browser_unavailable", "navigation_unavailable", "unexpected_navigation", "observation_timeout", "screenshot_unavailable", "image_too_large"];
  if (r.protocolVersion !== PROTOCOL || !Number.isFinite(Date.parse(r.observedAt)) || Object.entries(NO_AUTHORITY).some(([key]) => r[key as keyof typeof NO_AUTHORITY] !== false)) return unavailable("observation_timeout");
  const category = r.screenshotErrorCategory;
  if (category !== undefined && !SCREENSHOT_ERRORS.includes(category)) return unavailable("screenshot_unavailable");
  const base = { protocolVersion: PROTOCOL, observedAt: r.observedAt, ...(category ? { screenshotErrorCategory: category } : {}), ...NO_AUTHORITY };
  if (r.status === "unavailable") return { ...base, status: "unavailable", reason: reasons.includes(r.reason) ? r.reason : "observation_timeout" };
  const count = (n: number, max: number) => Number.isSafeInteger(n) && n >= 0 && n <= max;
  if (r.status !== "observed" || r.pageKind !== "login" || !count(r.blockedWriteRequestCount, 999) || !count(r.blockedSensitiveRequestCount, 999)) return unavailable("observation_timeout");
  const image = r.screenshot, screenshot = image && publicImage(image.base64);
  if (image && (!screenshot || image.mimeType !== "image/png" || image.width !== WIDTH || image.height !== HEIGHT || image.bytes !== screenshot.bytes)) return unavailable("screenshot_unavailable");
  const accessibility = r.accessibility;
  if (accessibility !== undefined && (!Array.isArray(accessibility) || accessibility.length > 80 || accessibility.some(node =>
    !node || typeof node.role !== "string" || !/^[A-Za-z][A-Za-z0-9 ]{0,39}$/.test(node.role) || typeof node.name !== "string" || !node.name || node.name.length > 200))) return unavailable("screenshot_unavailable");
  if (!screenshot && !accessibility?.length) return unavailable("screenshot_unavailable", category);
  return { ...base, status: "observed", pageKind: "login", ...(screenshot ? { screenshot } : {}),
    ...(accessibility?.length ? { accessibility: accessibility.map(({ role, name }) => ({ role, name })) } : {}),
    blockedWriteRequestCount: r.blockedWriteRequestCount, blockedSensitiveRequestCount: r.blockedSensitiveRequestCount };
}
