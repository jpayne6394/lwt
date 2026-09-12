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
