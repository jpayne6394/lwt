import { normalizeSupplierRecord } from "./normalization.ts";
import type { SupplierAdapter, SupplierAdapterContext, SupplierConfig } from "./types.ts";
import { SupplierAdapterError } from "./types.ts";

export type PublicCatalogKind = "shopify-json" | "squarespace-json" | "woocommerce-html";

export type PublicCatalogAdapterConfig = {
  kind: PublicCatalogKind;
  catalogUrl: string;
  allowedHosts: string[];
  fetchImpl?: typeof fetch;
  renderProductsImpl?: (catalogUrl: string, supplierId: string) => Promise<Record<string, unknown>[]>;
};

/** Reads supplier-owned public catalog pages without credentials, sessions, or write-capable routes. */
export class PublicCatalogSupplierAdapter implements SupplierAdapter {
  readonly supplier: SupplierConfig;
  readonly #config: PublicCatalogAdapterConfig;
  readonly #fetch: typeof fetch;
  readonly #renderProducts?: (catalogUrl: string, supplierId: string) => Promise<Record<string, unknown>[]>;

  constructor(supplier: SupplierConfig, config: PublicCatalogAdapterConfig) {
    this.supplier = supplier;
    this.#config = config;
    this.#fetch = config.fetchImpl ?? fetch;
    this.#renderProducts = config.renderProductsImpl;
    assertSafePublicCatalogUrl(config.catalogUrl, config.allowedHosts, supplier.id);
  }

  async verifyLogin() {
    try {
      const records = await this.#readRecords();
      if (records.length === 0) {
        return this.#check("login_failed", `${this.supplier.name} public catalog returned no readable products.`);
      }
      return this.#check("connected", `${this.supplier.name} public catalog is readable without a login.`);
    } catch (error) {
      if (error instanceof SupplierAdapterError && error.kind === "not_configured") {
        return this.#check("not_configured", error.message);
      }
      return this.#check("login_failed", `${this.supplier.name} public catalog could not be read.`);
    }
  }

  async fetchProducts(context: SupplierAdapterContext = {}) {
    const capturedAt = (context.now ?? new Date()).toISOString();
    return (await this.#readRecords()).map((record) =>
      normalizeSupplierRecord({
        supplierId: this.supplier.id,
        supplierName: this.supplier.name,
        record,
        capturedAt,
      }),
    );
  }

  async lookupProduct(supplierSku: string, context: SupplierAdapterContext = {}) {
    const wanted = cleanString(supplierSku).toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9._:/+ -]{0,119}$/.test(wanted)) {
      throw new SupplierAdapterError(this.supplier.id, "parse_failed", `${this.supplier.name} supplier SKU is invalid`);
    }
    const products = await this.fetchProducts(context);
    return products.find((product) => cleanString(product.sku).toUpperCase() === wanted) ?? null;
  }

  async #readRecords(): Promise<Record<string, unknown>[]> {
    const config = this.#config;
    assertSafePublicCatalogUrl(config.catalogUrl, config.allowedHosts, this.supplier.id);
    if (config.kind === "woocommerce-html" && this.#renderProducts) {
      return this.#renderProducts(config.catalogUrl, this.supplier.id);
    }

    const response = await this.#fetch(config.catalogUrl, {
      redirect: "follow",
      headers: {
        accept: config.kind === "woocommerce-html" ? "text/html,application/xhtml+xml" : "application/json",
        "user-agent": "Mozilla/5.0 Supplier Ops Agent",
      },
    });
    assertSafePublicCatalogUrl(response.url || config.catalogUrl, config.allowedHosts, this.supplier.id);
    if (!response.ok) {
      throw new SupplierAdapterError(
        this.supplier.id,
        "parse_failed",
        `${this.supplier.name} public catalog returned HTTP ${response.status}`,
      );
    }
    if (config.kind === "woocommerce-html") {
      return recordsFromWooCommerceHtml(await response.text(), this.supplier.id);
    }
    const body = await response.json() as unknown;
    return config.kind === "shopify-json"
      ? recordsFromShopify(body, config.catalogUrl, this.supplier.id)
      : recordsFromSquarespace(body, config.catalogUrl, this.supplier.id);
  }

  #check(status: "connected" | "login_failed" | "not_configured", message: string) {
    return { supplierId: this.supplier.id, supplierName: this.supplier.name, status, message } as const;
  }
}

export function recordsFromShopify(body: unknown, sourceUrl: string, supplierId: string): Record<string, unknown>[] {
  const products = isRecord(body) && Array.isArray(body.products) ? body.products : null;
  if (!products) {
    throw new SupplierAdapterError(supplierId, "parse_failed", "Shopify public catalog did not contain products");
  }
  const origin = new URL(sourceUrl).origin;
  return products.flatMap((product) => {
    if (!isRecord(product) || !Array.isArray(product.variants)) return [];
    const title = cleanString(product.title);
    const vendor = cleanString(product.vendor);
    const handle = cleanString(product.handle);
    const image = Array.isArray(product.images) && isRecord(product.images[0])
      ? cleanString(product.images[0].src)
      : "";
    return product.variants.flatMap((variant) => {
      if (!isRecord(variant)) return [];
      const sku = cleanString(variant.sku);
      if (!sku) return [];
      const variantTitle = cleanString(variant.title);
      const price = parseFiniteNumber(variant.price);
      const compareAt = parseFiniteNumber(variant.compare_at_price);
      const onSale = price !== undefined && compareAt !== undefined && compareAt > price;
      return [{
        title: variantTitle && variantTitle !== "Default Title" ? `${title} (${variantTitle})` : title,
        brand: vendor,
        sku,
        available: Boolean(variant.available),
        msrp: onSale ? compareAt : price,
        sale_price: onSale ? price : undefined,
        url: handle ? `${origin}/products/${encodeURIComponent(handle)}` : undefined,
        image,
      }];
    });
  });
}

export function recordsFromSquarespace(body: unknown, sourceUrl: string, supplierId: string): Record<string, unknown>[] {
  const items = isRecord(body) && Array.isArray(body.items) ? body.items : null;
  if (!items) {
    throw new SupplierAdapterError(supplierId, "parse_failed", "Squarespace public catalog did not contain products");
  }
  const origin = new URL(sourceUrl).origin;
  return items.flatMap((item) => {
    if (!isRecord(item) || !Array.isArray(item.variants)) return [];
    const title = cleanString(item.title);
    const fullUrl = cleanString(item.fullUrl);
    const image = cleanString(item.assetUrl);
    return item.variants.flatMap((variant) => {
      if (!isRecord(variant)) return [];
      const sku = cleanString(variant.sku);
      if (!sku) return [];
      const price = parseFiniteNumber(variant.price);
      const salePrice = parseFiniteNumber(variant.salePrice);
      const onSale = Boolean(variant.onSale) && salePrice !== undefined;
      const unlimited = Boolean(variant.unlimited);
      const quantity = parseFiniteNumber(variant.qtyInStock);
      return [{
        title,
        sku,
        available: unlimited || (quantity ?? 0) > 0,
        quantity: unlimited ? undefined : quantity,
        msrp: price === undefined ? undefined : price / 100,
        sale_price: onSale ? salePrice! / 100 : undefined,
        url: fullUrl ? new URL(fullUrl, origin).toString() : undefined,
        image,
      }];
    });
  });
}

export function recordsFromWooCommerceHtml(html: string, supplierId: string): Record<string, unknown>[] {
  const encodedRecords = Array.from(
    html.matchAll(/data-gtm4wp_product_data=(?:"([^"]+)"|'([^']+)')/gi),
    (match) => match[1] ?? match[2] ?? "",
  );
  const records = encodedRecords.flatMap((raw) => {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(decodeHtmlAttribute(raw)) as Record<string, unknown>;
    } catch {
      return [];
    }
    const sku = cleanString(data.sku);
    const title = cleanString(data.item_name);
    if (!sku || !title) return [];
    const stockStatus = cleanString(data.stockstatus).toLowerCase();
    return [{
      title,
      brand: cleanString(data.item_brand),
      sku,
      available: stockStatus === "instock",
      quantity: parseFiniteNumber(data.stocklevel),
      msrp: parseFiniteNumber(data.price),
      url: cleanString(data.productlink),
    }];
  });
  if (records.length === 0) {
    throw new SupplierAdapterError(supplierId, "parse_failed", "WooCommerce public catalog did not contain SKU records");
  }
  return records;
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function defaultPublicCatalogConfig(supplierId: string): PublicCatalogAdapterConfig | undefined {
  if (supplierId === "bioresource-pekana") {
    return {
      kind: "squarespace-json",
      catalogUrl: "https://new.bioresourceinc.com/products/pekana?format=json",
      allowedHosts: ["new.bioresourceinc.com"],
    };
  }
  if (supplierId === "systemic-formulas") {
    return {
      kind: "woocommerce-html",
      catalogUrl: "https://systemicformulas.com/products/?ppp=-1",
      allowedHosts: ["systemicformulas.com"],
    };
  }
  if (supplierId === "world-health-mall") {
    return {
      kind: "shopify-json",
      catalogUrl: "https://theworldhealthmall.com/products.json?limit=250",
      allowedHosts: ["theworldhealthmall.com"],
    };
  }
  if (supplierId === "physicians-standard") {
    return {
      kind: "shopify-json",
      catalogUrl: "https://www.physiciansstandard.com/products.json?limit=250",
      allowedHosts: ["www.physiciansstandard.com"],
    };
  }
  return undefined;
}

export function assertSafePublicCatalogUrl(value: string, allowedHosts: string[], supplierId: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SupplierAdapterError(supplierId, "not_configured", "Public supplier catalog URL is invalid");
  }
  const hosts = allowedHosts.map((host) => host.trim().toLowerCase()).filter(Boolean);
  if (
    url.protocol !== "https:" ||
    Boolean(url.username || url.password) ||
    !hosts.includes(url.hostname.toLowerCase()) ||
    /\/(?:cart|checkout|orders?)(?:\/|$)/i.test(url.pathname)
  ) {
    throw new SupplierAdapterError(
      supplierId,
      "not_configured",
      "Public supplier reads may only use an approved HTTPS catalog address",
    );
  }
}

function parseFiniteNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function cleanString(value: unknown): string {
  return String(value ?? "").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
