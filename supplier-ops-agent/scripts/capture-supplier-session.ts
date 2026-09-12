import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";

import { createSupplierRegistry } from "../src/suppliers/registry.ts";
import { defaultWebsiteConfig, mergeWebsiteConfig } from "../src/suppliers/portal-defaults.ts";
import {
  allowedSupplierHosts,
  assertSafeSupplierUrl,
  isCookieDomainAllowed,
  type WebsiteAdapterConfig,
} from "../src/suppliers/website-adapter.ts";

const args = process.argv.slice(2);
const supplierId = optionValue(args, "--supplier");
if (!supplierId) {
  throw new Error("Usage: npm run capture:supplier -- --supplier <supplier-id> [output-file]");
}

const supplier = createSupplierRegistry().find((candidate) => candidate.id === supplierId);
if (!supplier) throw new Error(`Unknown supplier: ${supplierId}`);

const suffix = supplier.id.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
const rawConfig = process.env[`SUPPLIER_WEBSITE_CONFIG_${suffix}`];
let overrideConfig: WebsiteAdapterConfig = {};
if (rawConfig) {
  try {
    overrideConfig = JSON.parse(rawConfig) as WebsiteAdapterConfig;
  } catch {
    throw new Error(`${supplier.name} portal configuration is invalid.`);
  }
}
const config = mergeWebsiteConfig(defaultWebsiteConfig(supplier.id), overrideConfig);

if (!config.loginUrl || !config.productsUrl || !config.authenticatedSelector) {
  throw new Error(`${supplier.name} needs sign-in, catalog, and authenticated-marker settings before capture.`);
}

const allowedHosts = allowedSupplierHosts(config);
assertSafeSupplierUrl(config.loginUrl, allowedHosts, supplier.id, "sign-in");
assertSafeSupplierUrl(config.productsUrl, allowedHosts, supplier.id, "catalog");

const outputArgument = args.find((value, index) => !value.startsWith("--") && args[index - 1] !== "--supplier");
const authRoot = path.resolve(process.cwd(), ".auth");
const outputPath = path.resolve(process.cwd(), outputArgument ?? `.auth/${supplier.id}-cookie.env`);
const profilePath = path.join(authRoot, `${supplier.id}-browser`);
if (!outputPath.startsWith(`${authRoot}${path.sep}`)) {
  throw new Error("Supplier sessions may only be written inside the private .auth directory.");
}

await mkdir(path.dirname(outputPath), { recursive: true });
await mkdir(profilePath, { recursive: true });

const context = await chromium.launchPersistentContext(profilePath, {
  channel: "chrome",
  headless: false,
  viewport: { width: 1440, height: 1000 },
});

try {
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(config.loginUrl, { waitUntil: "domcontentloaded" });
  console.log(`Complete one normal ${supplier.name} sign-in. The verified read-only session will be captured automatically.`);
  const authenticatedPage = await waitForAuthenticatedPage(context, allowedHosts, config.authenticatedSelector);
  await authenticatedPage.goto(config.productsUrl, { waitUntil: "domcontentloaded" });
  assertSafeSupplierUrl(authenticatedPage.url(), allowedHosts, supplier.id, "catalog response");
  if (!(await authenticatedPage.locator(config.authenticatedSelector).isVisible().catch(() => false))) {
    throw new Error(`${supplier.name} did not preserve the authenticated session on its catalog page.`);
  }

  const cookies = await context.cookies(allowedHosts.map((host) => `https://${host}/`));
  const cookieHeader = cookies
    .filter((cookie) => isCookieDomainAllowed(cookie.domain, allowedHosts))
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
  if (!cookieHeader) throw new Error(`${supplier.name} did not create a reusable browser session.`);

  await writeFile(outputPath, `SUPPLIER_COOKIE_${suffix}=${cookieHeader}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  console.log(`Saved the verified ${supplier.name} session without printing its value.`);
} finally {
  await context.close();
}

async function waitForAuthenticatedPage(
  context: BrowserContext,
  allowedHosts: string[],
  authenticatedSelector: string,
): Promise<Page> {
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    for (const page of context.pages()) {
      let hostname = "";
      try {
        hostname = new URL(page.url()).hostname.toLowerCase();
      } catch {
        continue;
      }
      if (!allowedHosts.includes(hostname)) continue;
      if (await page.locator(authenticatedSelector).isVisible().catch(() => false)) return page;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Supplier sign-in was not completed within ten minutes.");
}

function optionValue(values: string[], name: string): string | undefined {
  const index = values.indexOf(name);
  return index >= 0 ? values[index + 1] : undefined;
}
