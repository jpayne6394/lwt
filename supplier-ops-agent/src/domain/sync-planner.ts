import { resolveInventoryQuantity } from "./inventory-policy.ts";
import { moneyEqual, roundMoney } from "./money.ts";
import { matchSupplierProduct } from "./product-matcher.ts";
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

  for (const supplierProduct of input.supplierProducts) {
    const match = matchSupplierProduct(supplierProduct, input.shopifyVariants, input.mappings);

    if (match.status === "blocked") {
      issues.push({
        kind: "match_uncertain",
        supplierProduct,
        reason: match.reason,
      });
      continue;
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
      continue;
    }

    appendMatchedProductChanges(changes, issues, supplierProduct, match.variant);
  }

  return { changes, issues };
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

