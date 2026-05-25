import { normalizeSupplierRecord } from "./normalization.ts";
import type { SupplierAdapter, SupplierAdapterContext, SupplierConfig } from "./types.ts";
import { SupplierAdapterError } from "./types.ts";

export type WebsiteAdapterConfig = {
  loginUrl?: string;
  productsUrl?: string;
  username?: string;
  password?: string;
  selectors?: {
    username: string;
    password: string;
    submit: string;
    productRows: string;
  };
};

export class WebsiteSupplierAdapter implements SupplierAdapter {
  readonly supplier: SupplierConfig;
  readonly #config: WebsiteAdapterConfig;

  constructor(supplier: SupplierConfig, config: WebsiteAdapterConfig = {}) {
    this.supplier = supplier;
    this.#config = config;
  }

  async fetchProducts(context: SupplierAdapterContext = {}) {
    if (!this.#config.loginUrl || !this.#config.productsUrl || !this.#config.selectors) {
      throw new SupplierAdapterError(
        this.supplier.id,
        "not_configured",
        `${this.supplier.name} needs portal URL and selectors before website automation can run`,
      );
    }

    if (!this.#config.username || !this.#config.password) {
      throw new SupplierAdapterError(this.supplier.id, "login_failed", `${this.supplier.name} credentials are missing`);
    }

    const playwright = await import("playwright");
    const browser = await playwright.chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(this.#config.loginUrl, { waitUntil: "networkidle" });
      await page.fill(this.#config.selectors.username, this.#config.username);
      await page.fill(this.#config.selectors.password, this.#config.password);
      await page.click(this.#config.selectors.submit);
      await page.waitForLoadState("networkidle");

      const twoFactorVisible = await page.getByText(/two-factor|2fa|verification code/i).count();
      if (twoFactorVisible > 0) {
        throw new SupplierAdapterError(this.supplier.id, "two_factor_required", `${this.supplier.name} requires 2FA`);
      }

      await page.goto(this.#config.productsUrl, { waitUntil: "networkidle" });
      const records = await page.$$eval(this.#config.selectors.productRows, (rows) =>
        rows.map((row) => {
          const element = row as HTMLElement;
          return {
            title: element.dataset.title ?? element.querySelector("[data-title]")?.textContent ?? "",
            sku: element.dataset.sku ?? element.querySelector("[data-sku]")?.textContent ?? "",
            upc: element.dataset.upc ?? element.querySelector("[data-upc]")?.textContent ?? "",
            brand: element.dataset.brand ?? element.querySelector("[data-brand]")?.textContent ?? "",
            available: element.dataset.available ?? element.querySelector("[data-available]")?.textContent ?? "",
            quantity: element.dataset.quantity ?? element.querySelector("[data-quantity]")?.textContent ?? "",
            cost: element.dataset.cost ?? element.querySelector("[data-cost]")?.textContent ?? "",
            msrp: element.dataset.msrp ?? element.querySelector("[data-msrp]")?.textContent ?? "",
            sale_price: element.dataset.salePrice ?? element.querySelector("[data-sale-price]")?.textContent ?? "",
            url: element.dataset.url ?? "",
            image: element.dataset.image ?? "",
          };
        }),
      );

      const capturedAt = (context.now ?? new Date()).toISOString();
      return records.map((record) =>
        normalizeSupplierRecord({
          supplierId: this.supplier.id,
          supplierName: this.supplier.name,
          record,
          capturedAt,
        }),
      );
    } finally {
      await browser.close();
    }
  }
}

