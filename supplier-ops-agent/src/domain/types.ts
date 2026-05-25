export type StockStatus = "in_stock" | "out_of_stock" | "unknown";

export type SupplierProduct = {
  supplierId: string;
  supplierName: string;
  brand?: string;
  sku?: string;
  upc?: string;
  title: string;
  stockStatus: StockStatus;
  quantity?: number;
  cost?: number;
  msrp?: number;
  salePrice?: number;
  productUrl?: string;
  imageUrls?: string[];
  capturedAt: string;
};

export type ShopifyVariant = {
  productId: string;
  variantId: string;
  inventoryItemId: string;
  locationId: string;
  handle: string;
  title: string;
  vendor: string;
  sku?: string;
  barcode?: string;
  price: number;
  compareAtPrice: number | null;
  cost: number | null;
  status: string;
};

export type ProductMapping = {
  supplierId: string;
  supplierSku?: string;
  supplierUpc?: string;
  supplierTitle?: string;
  shopifyVariantId: string;
};

export type MatchStrategy = "manual" | "sku" | "upc" | "title_vendor";

export type MatchResult =
  | {
      status: "matched";
      strategy: MatchStrategy;
      confidence: number;
      variant: ShopifyVariant;
    }
  | {
      status: "blocked";
      reason: string;
      candidate?: {
        variant: ShopifyVariant;
        confidence: number;
      };
    }
  | {
      status: "unmatched";
      reason: string;
    };

export type PlannedChange =
  | {
      type: "inventory";
      variantId: string;
      inventoryItemId: string;
      locationId: string;
      quantity: number;
      reason: string;
    }
  | {
      type: "price";
      productId: string;
      variantId: string;
      price: number;
      compareAtPrice: number | null;
      reason: string;
    }
  | {
      type: "cost";
      inventoryItemId: string;
      cost: number;
      reason: string;
    }
  | {
      type: "draft_product";
      supplierProduct: SupplierProduct;
      draftPrice: number | null;
      reason: string;
    };

export type BlockedIssue = {
  kind:
    | "match_uncertain"
    | "price_guardrail"
    | "stock_unknown"
    | "supplier_error"
    | "shopify_error";
  supplierProduct?: SupplierProduct;
  shopifyVariant?: ShopifyVariant;
  reason: string;
  data?: Record<string, unknown>;
};

export type SyncPlan = {
  changes: PlannedChange[];
  issues: BlockedIssue[];
};

