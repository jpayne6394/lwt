import { resolveInventoryQuantity } from "./inventory-policy.ts";
import { moneyEqual, roundMoney } from "./money.ts";
import { createProductMatcher, type ProductMatcher } from "./product-matcher.ts";
import { planPriceUpdate, resolveRegularPrice } from "./pricing-policy.ts";
import type {
  BlockedIssue,
  PlannedChange,
  ProductMapping,
  ShopifyVariant,
  SupplierProduct,
  SyncPlan,
} from "./types.ts";

export type SupplierSyncInput = {
  supplierProducts: SupplierProduct[];
  shopifyVariants: ShopifyVariant[];
  mappings: ProductMapping[];
};

export function planSupplierSync(input: SupplierSyncInput): SyncPlan {
  const changes: PlannedChange[] = [];
  const issues: BlockedIssue[] = [];
  const matcher = createProductMatcher(input.shopifyVariants, input.mappings);

  for (const supplierProduct of input.supplierProducts) {
    planSupplierProduct(matcher, changes, issues, supplierProduct);
  }

  return { changes, issues };
}

export async function planSupplierSyncAsync(input: SupplierSyncInput, yieldEvery = 10): Promise<SyncPlan> {
  const changes: PlannedChange[] = [];
  const issues: BlockedIssue[] = [];
  const matcher = createProductMatcher(input.shopifyVariants, input.mappings);

  for (const [index, supplierProduct] of input.supplierProducts.entries()) {
    planSupplierProduct(matcher, changes, issues, supplierProduct);
    if ((index + 1) % yieldEvery === 0) {
      await yieldToEventLoop();
    }
  }

  return { changes, issues };
}

function planSupplierProduct(
  matcher: ProductMatcher,
  changes: PlannedChange[],
  issues: BlockedIssue[],
  supplierProduct: SupplierProduct,
): void {
  const match = matcher.match(supplierProduct);

  if (match.status === "blocked") {
    issues.push({
      kind: "match_uncertain",
      supplierProduct,
      shopifyVariant: match.candidate?.variant,
      reason: match.reason,
      data: {
        supplier: supplierProductSummary(supplierProduct),
        candidate: match.candidate ? shopifyVariantSummary(match.candidate.variant) : undefined,
        matchConfidence: match.candidate?.confidence,
      },
    });
    return;
  }

  if (match.status === "unmatched") {
    const regularPrice = resolveRegularPrice({
      supplierCost: supplierProduct.cost,
      supplierMsrp: supplierProduct.msrp,
    });
    changes.push({
      type: "draft_product",
      supplierProduct,
      draftPrice: regularPrice.price,
      reason: match.reason,
    });
    return;
  }

  appendMatchedProductChanges(changes, issues, supplierProduct, match.variant);
}

function supplierProductSummary(product: SupplierProduct): Record<string, unknown> {
  return {
    supplierId: product.supplierId,
    supplierName: product.supplierName,
    brand: product.brand,
    sku: product.sku,
    upc: product.upc,
    title: product.title,
    stockStatus: product.stockStatus,
    quantity: product.quantity,
    cost: product.cost,
    msrp: product.msrp,
    salePrice: product.salePrice,
    productUrl: product.productUrl,
  };
}

function shopifyVariantSummary(variant: ShopifyVariant): Record<string, unknown> {
  return {
    productId: variant.productId,
    variantId: variant.variantId,
    handle: variant.handle,
    title: variant.title,
    vendor: variant.vendor,
    sku: variant.sku,
    barcode: variant.barcode,
    price: variant.price,
    compareAtPrice: variant.compareAtPrice,
    cost: variant.cost,
    status: variant.status,
  };
}

function appendMatchedProductChanges(
  changes: PlannedChange[],
  issues: BlockedIssue[],
  supplierProduct: SupplierProduct,
  variant: ShopifyVariant,
): void {
  const inventory = resolveInventoryQuantity({
    stockStatus: supplierProduct.stockStatus,
    quantity: supplierProduct.quantity,
  });

  if (inventory.shouldUpdate) {
    changes.push({
      type: "inventory",
      variantId: variant.variantId,
      inventoryItemId: variant.inventoryItemId,
      locationId: variant.locationId,
      quantity: inventory.quantity,
      reason:
        supplierProduct.stockStatus === "in_stock" && supplierProduct.quantity === undefined
          ? "Supplier in stock without exact quantity"
          : "Supplier stock changed",
    });
  } else {
    issues.push({
      kind: "stock_unknown",
      supplierProduct,
      shopifyVariant: variant,
      reason: inventory.reason,
    });
  }

  if (Number.isFinite(supplierProduct.cost) && supplierProduct.cost !== undefined) {
    const supplierCost = roundMoney(supplierProduct.cost);
    if (!moneyEqual(supplierCost, variant.cost)) {
      changes.push({
        type: "cost",
        inventoryItemId: variant.inventoryItemId,
        cost: supplierCost,
        reason: "Supplier cost changed",
      });
    }
  }

  const price = planPriceUpdate({
    currentPrice: variant.price,
    supplierCost: supplierProduct.cost,
    supplierMsrp: supplierProduct.msrp,
    supplierSalePrice: supplierProduct.salePrice,
  });

  if (!price.shouldUpdate) {
    if (price.reason === "Price change exceeds 25% guardrail") {
      issues.push({
        kind: "price_guardrail",
        supplierProduct,
        shopifyVariant: variant,
        reason: price.reason,
        data: {
          currentPrice: price.currentPrice,
          blockedPrice: price.blockedPrice,
        },
      });
    }
    return;
  }

  if (!moneyEqual(price.price, variant.price) || !moneyEqual(price.compareAtPrice, variant.compareAtPrice)) {
    changes.push({
      type: "price",
      productId: variant.productId,
      variantId: variant.variantId,
      price: price.price,
      compareAtPrice: price.compareAtPrice,
      reason: price.reason,
    });
  }
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

