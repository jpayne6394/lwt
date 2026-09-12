import { normalizeSupplierRecord } from "./normalization.ts";
import type {
  SupplierAdapter,
  SupplierAdapterContext,
  SupplierConfig,
  SupplierConnectionCheck,
} from "./types.ts";
import { SupplierAdapterError } from "./types.ts";

export type EmersonCatalogAdapterConfig = {
  catalogUrls?: string[];
  cookieHeader?: string;
  fetchImpl?: typeof fetch;
};

type ApolloState = Record<string, Record<string, unknown>>;

const DEFAULT_CATALOG_URL = "https://emersonecologics.com/shop";

/**
 * Uses a session created by a real, user-completed Emerson login. This avoids
 * replaying the password form (and its CAPTCHA) on every read-only run.
 */
export class EmersonCatalogSupplierAdapter implements SupplierAdapter {
  readonly supplier: SupplierConfig;
  readonly #catalogUrls: string[];
  readonly #cookieHeader?: string;
  readonly #fetch: typeof fetch;

  constructor(supplier: SupplierConfig, config: EmersonCatalogAdapterConfig = {}) {
    this.supplier = supplier;
    this.#catalogUrls = config.catalogUrls?.length ? config.catalogUrls : [DEFAULT_CATALOG_URL];
    this.#cookieHeader = cleanString(config.cookieHeader) || undefined;
    this.#fetch = config.fetchImpl ?? fetch;
  }

  async verifyLogin(): Promise<SupplierConnectionCheck> {
    if (!this.#cookieHeader) {
      return this.#check("not_configured", `${this.supplier.name} needs a one-time browser session connection.`);
    }

    try {
      const { html, responseUrl } = await this.#readCatalog(this.#catalogUrls[0]);
      if (requiresSignIn(html, responseUrl)) {
        return this.#check(
          "verification_required",
          `${this.supplier.name} session expired and needs one browser reconnection.`,
        );
      }
      const state = parseApolloState(html, this.supplier.id);
      if (recordsFromState(state).length === 0) {
        return this.#check("login_failed", `${this.supplier.name} did not return a readable catalog.`);
      }
      return this.#check("connected", `${this.supplier.name} reusable session is connected for read-only catalog access.`);
    } catch (error) {
      if (error instanceof SupplierAdapterError && error.kind === "verification_required") {
        return this.#check("verification_required", error.message);
      }
      return this.#check("login_failed", `${this.supplier.name} session check could not read the catalog.`);
    }
  }

  async fetchProducts(context: SupplierAdapterContext = {}) {
    if (!this.#cookieHeader) {
      throw new SupplierAdapterError(
        this.supplier.id,
        "not_configured",
        `${this.supplier.name} needs a one-time browser session connection`,
      );
    }

    const capturedAt = (context.now ?? new Date()).toISOString();
    const records: Record<string, unknown>[] = [];

    for (const catalogUrl of this.#catalogUrls) {
      const { html, responseUrl } = await this.#readCatalog(catalogUrl);
      if (requiresSignIn(html, responseUrl)) {
        throw new SupplierAdapterError(
          this.supplier.id,
          "verification_required",
          `${this.supplier.name} session expired and needs one browser reconnection`,
        );
      }
      records.push(...recordsFromState(parseApolloState(html, this.supplier.id)));
    }

    const deduped = dedupeBySku(records);
    if (deduped.length === 0) {
      throw new SupplierAdapterError(
        this.supplier.id,
        "parse_failed",
        "Emerson catalog page did not include product records",
      );
    }

    return deduped.map((record) =>
      normalizeSupplierRecord({
        supplierId: this.supplier.id,
        supplierName: this.supplier.name,
        record,
        capturedAt,
      }),
    );
  }

  async #readCatalog(catalogUrl: string): Promise<{ html: string; responseUrl: string }> {
    assertSafeEmersonUrl(catalogUrl, this.supplier.id);
    const response = await this.#fetch(catalogUrl, {
      redirect: "follow",
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "Mozilla/5.0 Supplier Ops Agent",
        cookie: this.#cookieHeader!,
      },
    });

    if (response.status === 401 || response.status === 403) {
      throw new SupplierAdapterError(
        this.supplier.id,
        "verification_required",
        `${this.supplier.name} session expired and needs one browser reconnection`,
      );
    }
    if (!response.ok) {
      throw new SupplierAdapterError(
        this.supplier.id,
        "parse_failed",
        `Emerson catalog returned HTTP ${response.status}`,
      );
    }
    return { html: await response.text(), responseUrl: response.url || catalogUrl };
  }

  #check(status: SupplierConnectionCheck["status"], message: string): SupplierConnectionCheck {
    return { supplierId: this.supplier.id, supplierName: this.supplier.name, status, message };
  }
}

export function parseEmersonCatalogUrls(value: string | undefined): string[] | undefined {
  const urls = value
    ?.split(/[\n,]+/)
    .map((url) => url.trim())
    .filter(Boolean);
  return urls?.length ? urls : undefined;
}

export function requiresSignIn(html: string, responseUrl: string): boolean {
  let pathname = "";
  try {
    pathname = new URL(responseUrl).pathname;
  } catch {
    // The response body check below remains authoritative in tests and proxies.
  }
  return (
    /^\/login\/?$/i.test(pathname) ||
    /<a\b[^>]*href=["']\/login["'][^>]*>\s*Sign in\s*<\/a>/i.test(html) ||
    /<input\b[^>]*type=["']password["']/i.test(html)
  );
}

export function assertSafeEmersonUrl(value: string, supplierId: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SupplierAdapterError(supplierId, "not_configured", "Emerson catalog URL is invalid");
  }
  if (url.protocol !== "https:" || !/(^|\.)emersonecologics\.com$/i.test(url.hostname)) {
    throw new SupplierAdapterError(
      supplierId,
      "not_configured",
      "Emerson session may only be sent to an HTTPS Emerson Ecologics address",
    );
  }
}

function parseApolloState(html: string, supplierId: string): ApolloState {
  const encoded = html.match(/<meta[^>]+name=["']apollo-state["'][^>]+content=["']([^"']+)["']/i)?.[1];
  if (!encoded) {
    throw new SupplierAdapterError(supplierId, "parse_failed", "Emerson catalog page did not include product state");
  }

  try {
    return JSON.parse(decodeURIComponent(Buffer.from(encoded, "base64").toString("utf8"))) as ApolloState;
  } catch {
    throw new SupplierAdapterError(supplierId, "parse_failed", "Emerson catalog product state could not be parsed");
  }
}

function recordsFromState(state: ApolloState): Record<string, unknown>[] {
  return Object.entries(state)
    .filter(([key, product]) => key.startsWith("Product:") && product.__typename === "Product")
    .map(([, product]) => recordFromProduct(state, product))
    .filter((record): record is Record<string, unknown> => record !== undefined);
}

function recordFromProduct(state: ApolloState, product: Record<string, unknown>): Record<string, unknown> | undefined {
  const variant = refRecord(state, product.availableOrMasterVariant);
  if (!variant) return undefined;

  const brandName = cleanString(refRecord(state, product.brand)?.name);
  const productSlug = cleanString(product.slug);
  const productId = cleanString(product.id);
  const emersonVariantId = cleanString(variant.emersonVariantId);

  return {
    brand: brandName,
    sku: firstPresent(variant.sku, variant.emersonVariantId),
    title: firstPresent(variant.name, variant.descriptor, product.name),
    stockStatus: stockStatusFromVariant(variant),
    quantity: firstPresent(variant.quantityAvailable, variant.availableQuantity, variant.quantity, variant.stock),
    cost: firstPresent(
      variant.cost,
      variant.price,
      variant.accountPrice,
      variant.practitionerPrice,
      variant.wholesalePrice,
      variant.customerPrice,
    ),
    msrp: firstPresent(variant.msrp, variant.retailPrice, variant.listPrice),
    sale_price: firstPresent(variant.salePrice, variant.promoPrice, variant.discountPrice),
    url:
      productSlug && productId && emersonVariantId
        ? `https://www.emersonecologics.com/products/detail/${slugify(brandName)}/${productSlug}/${productId}/${emersonVariantId}`
        : undefined,
    image: firstPresent(variant.imageNew, variant.image, variant.imageUrl),
  };
}

function stockStatusFromVariant(variant: Record<string, unknown>): string | undefined {
  const value = firstPresent(
    variant.stockStatus,
    variant.availability,
    variant.inStock,
    variant.isInStock,
    variant.available,
    variant.availableForSale,
  );
  if (value !== undefined) return String(value);

  const quantity = firstPresent(variant.quantityAvailable, variant.availableQuantity, variant.quantity, variant.stock);
  return quantity !== undefined ? String(quantity) : undefined;
}

function refRecord(state: ApolloState, value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const ref = cleanString(value.__ref);
  const record = state[ref];
  return isRecord(record) ? record : undefined;
}

function dedupeBySku(records: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    const sku = cleanString(record.sku);
    if (!sku || seen.has(sku)) return false;
    seen.add(sku);
    return true;
  });
}

function firstPresent(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function cleanString(value: unknown): string {
  return String(value ?? "").trim();
}

function slugify(value: string): string {
  return value.trim().replace(/&/g, "and").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
