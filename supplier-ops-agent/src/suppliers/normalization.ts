import type { StockStatus, SupplierProduct } from "../domain/types.ts";

export type NormalizeSupplierRecordInput = {
  supplierId: string;
  supplierName: string;
  record: Record<string, unknown>;
  capturedAt: string;
};

export function normalizeSupplierRecord(input: NormalizeSupplierRecordInput): SupplierProduct {
  const record = input.record;
  const imageUrls = parseImages(first(record, ["imageUrls", "images", "image", "image_url"]));

  return {
    supplierId: input.supplierId,
    supplierName: input.supplierName,
    brand: cleanString(first(record, ["brand", "vendor", "manufacturer"])) || undefined,
    sku: cleanString(first(record, ["sku", "SKU", "item", "item_number", "product_code"])) || undefined,
    upc: cleanString(first(record, ["upc", "UPC", "barcode", "gtin"])) || undefined,
    title: cleanString(first(record, ["title", "name", "product_name", "description"])) || "Untitled supplier item",
    stockStatus: parseStockStatus(record),
    quantity: parseQuantity(first(record, ["quantity", "qty", "available_quantity", "stock"])),
    cost: parseMoney(first(record, ["cost", "wholesale", "unit_cost", "price_cost"])),
    msrp: parseMoney(first(record, ["msrp", "list_price", "retail_price", "map", "price"])),
    salePrice: parseMoney(first(record, ["salePrice", "sale_price", "discount_price", "promo_price"])),
    productUrl: cleanString(first(record, ["url", "productUrl", "product_url"])) || undefined,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    capturedAt: input.capturedAt,
  };
}

function first(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== "") {
      return record[key];
    }
  }
  return undefined;
}

function cleanString(value: unknown): string {
  return String(value ?? "").trim();
}

function parseQuantity(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseMoney(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : undefined;
}

function parseImages(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(cleanString).filter(Boolean);
  }

  const single = cleanString(value);
  return single ? [single] : [];
}

function parseStockStatus(record: Record<string, unknown>): StockStatus {
  const raw = cleanString(first(record, ["stockStatus", "stock_status", "availability", "available", "in_stock", "status"]));
  const normalized = raw.toLowerCase();

  if (["true", "yes", "y", "available", "in stock", "instock", "1"].includes(normalized)) {
    return "in_stock";
  }

  if (["false", "no", "n", "unavailable", "out of stock", "outofstock", "0", "backordered"].includes(normalized)) {
    return "out_of_stock";
  }

  const quantity = parseQuantity(first(record, ["quantity", "qty", "available_quantity", "stock"]));
  if (quantity !== undefined) {
    return quantity > 0 ? "in_stock" : "out_of_stock";
  }

  return "unknown";
}

