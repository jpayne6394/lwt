import { normalizeSupplierRecord } from "./normalization.ts";
import type { SupplierAdapter, SupplierAdapterContext, SupplierConfig } from "./types.ts";
import { SupplierAdapterError } from "./types.ts";

export type EmersonCatalogAdapterConfig = {
  catalogUrls?: string[];
  cookieHeader?: string;
};

type ApolloState = Record<string, Record<string, unknown>>;

export class EmersonCatalogSupplierAdapter implements SupplierAdapter {
  readonly supplier: SupplierConfig;
  readonly #config: Required<Pick<EmersonCatalogAdapterConfig, "catalogUrls">> & EmersonCatalogAdapterConfig;

  constructor(supplier: SupplierConfig, config: EmersonCatalogAdapterConfig = {}) {
    this.supplier = supplier;
    this.#config = {
      ...config,
      catalogUrls: config.catalogUrls?.length ? config.catalogUrls : ["https://www.emersonecologics.com/shop"],
    };
  }

  async fetchProducts(context: SupplierAdapterContext = {}) {
    const capturedAt = (context.now ?? new Date()).toISOString();
    const records: Record<string, unknown>[] = [];

    for (const catalogUrl of this.#config.catalogUrls) {
      const response = await fetch(catalogUrl, {
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": "Mozilla/5.0 Supplier Ops Agent",
          ...(this.#config.cookieHeader ? { cookie: this.#config.cookieHeader } : {}),
        },
      });

      if (!response.ok) {
        throw new SupplierAdapterError(
          this.supplier.id,
          "parse_failed",
          `Emerson catalog returned HTTP ${response.status}`,
        );
      }

      const state = parseApolloState(await response.text(), this.supplier.id);
      records.push(...recordsFromState(state));
    }

    const deduped = dedupeBySku(records);
    if (deduped.length === 0) {
      throw new SupplierAdapterError(
        this.supplier.id,
        "parse_failed",
        "Emerson catalog page did not include product state",
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
}

function parseApolloState(html: string, supplierId: string): ApolloState {
  const encoded = html.match(/<meta[^>]+name=["']apollo-state["'][^>]+content=["']([^"']+)["']/i)?.[1];
  if (!encoded) {
    throw new SupplierAdapterError(supplierId, "parse_failed", "Emerson catalog page did not include product state");
  }

  try {
    return JSON.parse(decodeURIComponent(Buffer.from(encoded, "base64").toString("utf8"))) as ApolloState;
  } catch (error) {
    throw new SupplierAdapterError(
      supplierId,
      "parse_failed",
      `Emerson catalog product state could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
    );
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
  if (!variant) {
    return undefined;
  }

  const brand = refRecord(state, product.brand);
  const brandName = cleanString(brand?.name);
  const productSlug = cleanString(product.slug);
  const productId = cleanString(product.id);
  const emersonVariantId = cleanString(variant.emersonVariantId);

  return {
    brand: brandName,
    sku: firstPresent(variant.sku, variant.emersonVariantId),
    title: firstPresent(variant.name, product.name),
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

  if (value !== undefined) {
    return String(value);
  }

  const quantity = firstPresent(variant.quantityAvailable, variant.availableQuantity, variant.quantity, variant.stock);
  return quantity !== undefined ? String(quantity) : undefined;
}

function refRecord(state: ApolloState, value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const ref = cleanString(value.__ref);
  const record = state[ref];
  return isRecord(record) ? record : undefined;
}

function dedupeBySku(records: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    const sku = cleanString(record.sku);
    if (!sku || seen.has(sku)) {
      return false;
    }

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
  return value
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
