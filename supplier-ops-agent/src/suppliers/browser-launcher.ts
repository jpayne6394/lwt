export type SupplierBrowserMode = "managed" | "portable";

export function supplierBrowserMode(platform = process.platform): SupplierBrowserMode {
  return platform === "linux" ? "portable" : "managed";
}

export async function launchSupplierBrowser() {
  const { chromium: playwrightChromium } = await import("playwright");
  if (supplierBrowserMode() === "managed") {
    return playwrightChromium.launch({ headless: true });
  }

  const { default: portableChromium } = await import("@sparticuz/chromium");
  return playwrightChromium.launch({
    args: portableChromium.args,
    executablePath: await portableChromium.executablePath(),
    headless: true,
  });
}

/**
 * Extracts and starts the supplier browser before the HTTP service is marked
 * ready. Portable Chromium may take longer than the request proxy permits on
 * the first launch after a fresh deployment.
 */
export async function prewarmSupplierBrowser(
  launchBrowser: typeof launchSupplierBrowser = launchSupplierBrowser,
): Promise<void> {
  const browser = await launchBrowser();
  await browser.close();
}
