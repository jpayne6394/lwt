import type { ShopifyVariant } from "../domain/types.ts";
import type { SupplierOpsRepository } from "../storage/repository.ts";
import type {
  InventoryAgentResult,
  InventoryRiskItem,
  PriorityLabel,
  ProductSignal,
  ShopifyVariantProvider,
  VendorInventorySummary,
} from "./intelligenceTypes.ts";

export type RunInventoryAgentInput = {
  repository: SupplierOpsRepository;
  lowStockThreshold?: number;
  listShopifyVariants?: ShopifyVariantProvider;
};

export async function runInventoryAgent(input: RunInventoryAgentInput): Promise<InventoryAgentResult> {
  const variants = await loadVariants(input);
  const threshold = input.lowStockThreshold ?? 5;
  const activeVariants = variants.filter((variant) => variant.status !== "archived");
  const riskItems = activeVariants
    .map((variant) => toInventoryRiskItem(variant, threshold))
    .filter((item): item is InventoryRiskItem => Boolean(item));
  const outOfStock = riskItems.filter((item) => item.quantity !== null && item.quantity <= 0);
  const lowStock = riskItems.filter((item) => item.quantity !== null && item.quantity > 0 && item.quantity <= threshold);
  const signals = [...outOfStock, ...lowStock].map(toProductSignal);
  const vendorSummary = summarizeByVendor(activeVariants, riskItems);
  const actionItems = buildActionItems(outOfStock, lowStock);
  const dataNotes = buildDataNotes(variants);

  return {
    generatedAt: new Date().toISOString(),
    brief: buildBrief(outOfStock.length, lowStock.length, variants.length),
    actionItems,
    alerts: {
      lowStock,
      outOfStock,
      highVelocityLowStock: [],
      staleStock: [],
    },
    vendorSummary,
    signals,
    sourceProductCount: variants.length,
    dataNotes,
  };
}

async function loadVariants(input: RunInventoryAgentInput): Promise<ShopifyVariant[]> {
  if (input.listShopifyVariants) {
    try {
      const liveVariants = await input.listShopifyVariants();
      if (liveVariants.length) {
        return liveVariants;
      }
    } catch {
      // Fall back to the repository cache so the dashboard stays useful during connector setup.
    }
  }
  return input.repository.listShopifyVariants();
}

function toInventoryRiskItem(variant: ShopifyVariant, threshold: number): InventoryRiskItem | null {
  const quantity = variant.inventoryQuantity ?? null;
  if (quantity === null) {
    return null;
  }

  if (quantity <= 0) {
    return {
      productId: variant.productId,
      variantId: variant.variantId,
      title: variant.title,
      vendor: variant.vendor || "Unknown vendor",
      category: variant.category,
      sku: variant.sku,
      quantity,
      priority: "Critical",
      reason: "Out of stock. Review whether to reorder, hide, or avoid promoting this product.",
    };
  }

  if (quantity <= threshold) {
    return {
      productId: variant.productId,
      variantId: variant.variantId,
      title: variant.title,
      vendor: variant.vendor || "Unknown vendor",
      category: variant.category,
      sku: variant.sku,
      quantity,
      priority: "Watch",
      reason: `Only ${quantity} left. Keep visible if replenishment is reliable; avoid major pushes until reviewed.`,
    };
  }

  return null;
}

function toProductSignal(item: InventoryRiskItem): ProductSignal {
  return {
    id: `signal_${item.variantId}_${Date.now()}`,
    shopifyProductId: item.productId,
    productTitle: item.title,
    vendor: item.vendor,
    category: item.category,
    signalType: item.priority === "Critical" ? "out_of_stock" : "low_stock",
    priority: item.priority,
    reason: item.reason,
    createdAt: new Date().toISOString(),
  };
}

function summarizeByVendor(variants: ShopifyVariant[], riskItems: InventoryRiskItem[]): VendorInventorySummary[] {
  const summaries = new Map<string, VendorInventorySummary>();
  for (const variant of variants) {
    const vendor = variant.vendor || "Unknown vendor";
    summaries.set(vendor, summaries.get(vendor) ?? { vendor, critical: 0, watch: 0, normal: 0 });
  }

  for (const item of riskItems) {
    const summary = summaries.get(item.vendor) ?? { vendor: item.vendor, critical: 0, watch: 0, normal: 0 };
    if (item.priority === "Critical") {
      summary.critical += 1;
    } else if (item.priority === "Watch") {
      summary.watch += 1;
    }
    summaries.set(item.vendor, summary);
  }

  for (const variant of variants) {
    const vendor = variant.vendor || "Unknown vendor";
    const hasRisk = riskItems.some((item) => item.variantId === variant.variantId);
    if (!hasRisk) {
      const summary = summaries.get(vendor);
      if (summary) {
        summary.normal += 1;
      }
    }
  }

  return [...summaries.values()].sort((left, right) => {
    const riskDelta = right.critical + right.watch - (left.critical + left.watch);
    return riskDelta || left.vendor.localeCompare(right.vendor);
  });
}

function buildActionItems(outOfStock: InventoryRiskItem[], lowStock: InventoryRiskItem[]): string[] {
  const items: string[] = [];
  for (const product of outOfStock.slice(0, 3)) {
    items.push(`Review ${product.title}: out of stock and should not be featured until replenishment is clear.`);
  }
  for (const product of lowStock.slice(0, 3)) {
    items.push(`Watch ${product.title}: ${product.quantity} left, so keep promotion light until inventory is reviewed.`);
  }
  if (!items.length) {
    items.push("No immediate stock risks found in the available Shopify inventory data.");
  }
  return items.slice(0, 5);
}

function buildBrief(outOfStockCount: number, lowStockCount: number, totalProducts: number): string {
  if (!totalProducts) {
    return "Inventory data is not available yet. Configure Shopify or run a supplier sync to populate the dashboard.";
  }
  if (outOfStockCount || lowStockCount) {
    return `${outOfStockCount} products are out of stock and ${lowStockCount} products are low stock based on available inventory quantities.`;
  }
  return "Available inventory data shows no immediate low-stock or out-of-stock risks.";
}

function buildDataNotes(variants: ShopifyVariant[]): string[] {
  const notes: string[] = [];
  if (!variants.length) {
    notes.push("No Shopify variant cache is available yet.");
  }
  if (variants.some((variant) => variant.inventoryQuantity === undefined)) {
    notes.push("Some products do not include inventory quantity yet; run a Shopify catalog refresh for fuller risk scoring.");
  }
  notes.push("High velocity low stock and stale stock require order/sales history; v1 shows them only when that data is added.");
  return notes;
}
