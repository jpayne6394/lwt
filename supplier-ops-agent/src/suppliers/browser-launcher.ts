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
