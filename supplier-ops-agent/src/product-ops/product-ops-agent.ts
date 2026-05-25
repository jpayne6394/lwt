import type { BlockedIssue, PlannedChange, ProductMapping, ShopifyVariant, SupplierProduct } from "../domain/types.ts";
import { matchSupplierProduct } from "../domain/product-matcher.ts";
import type {
  ProductOpsError,
  ProductOpsProductResult,
  ProductOpsRunOutput,
  ProductOpsRunType,
  ProductOpsTask,
  PromotionStatus,
} from "./types.ts";

const DEFAULT_LOW_STOCK_THRESHOLD = 3;
const CONFIDENT_MATCH_THRESHOLD = 0.78;

const PROMOTION_PRIORITY: PromotionStatus[] = [
  "DO_NOT_PROMOTE",
  "REVIEW_REQUIRED",
  "OUT_OF_STOCK",
  "LOW_STOCK",
  "BAD_PAGE",
  "NEEDS_DATA_CLEANUP",
  "PROMOTE_READY",
];

export type EvaluateProductReadinessInput = {
  supplierProduct: SupplierProduct;
  shopifyVariant?: ShopifyVariant;
  matchConfidence: number;
  issues: BlockedIssue[];
  lowStockThreshold?: number;
};

export type BuildProductOpsRunOutputInput = {
  runId: string;
  runType?: ProductOpsRunType;
  dryRun: boolean;
  startedAt: string;
  finishedAt: string;
  supplierProducts: SupplierProduct[];
  shopifyVariants: ShopifyVariant[];
  mappings: ProductMapping[];
  changes: PlannedChange[];
  issues: BlockedIssue[];
  supplierCount: number;
  lowStockThreshold?: number;
};

export function evaluateProductReadiness(input: EvaluateProductReadinessInput): ProductOpsProductResult {
  const flags: string[] = [];
  const reasons: string[] = [];
  const statusCandidates: PromotionStatus[] = [];
  const variant = input.shopifyVariant;
  const tags = (variant?.tags ?? []).map((tag) => tag.toLowerCase().trim());
  const lowStockThreshold = input.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD;

  if (tags.some((tag) => ["do-not-promote", "do_not_promote", "discontinued", "risky"].includes(tag))) {
    addFlag("manual_do_not_promote", "Product is tagged do-not-promote, discontinued, or risky.", "DO_NOT_PROMOTE");
  }

  if (variant && variant.status !== "active") {
    addFlag("not_active", `Product status is ${variant.status}; only active products are promotion eligible.`, "DO_NOT_PROMOTE");
  }

  if (variant && !variant.publishedAt) {
    addFlag("not_published", "Product is not published to the online store.", "DO_NOT_PROMOTE");
  }

  if (!variant) {
    addFlag("no_shopify_match", "No confident Shopify product match is available.", "REVIEW_REQUIRED");
  }

  if (input.matchConfidence < CONFIDENT_MATCH_THRESHOLD) {
    addFlag("low_match_confidence", "Supplier match is not confident enough for promotion.", "REVIEW_REQUIRED");
  }

  if (input.issues.length > 0) {
    for (const issue of input.issues) {
      addFlag(issue.kind, issue.reason, "REVIEW_REQUIRED");
    }
  }

  if (input.supplierProduct.stockStatus === "out_of_stock" || (variant?.inventoryQuantity ?? Number.POSITIVE_INFINITY) <= 0) {
    addFlag("out_of_stock", "Supplier or Shopify inventory indicates the product is unavailable.", "OUT_OF_STOCK");
  }

  const availableQuantity = input.supplierProduct.quantity ?? variant?.inventoryQuantity;
  if (
    input.supplierProduct.stockStatus === "in_stock" &&
    availableQuantity !== undefined &&
    availableQuantity !== null &&
    availableQuantity > 0 &&
    availableQuantity < lowStockThreshold
  ) {
    addFlag("low_stock", `Available quantity is below the low-stock threshold of ${lowStockThreshold}.`, "LOW_STOCK");
  }

  if (!variant?.imageUrls?.length) {
    addFlag("missing_image", "Product is missing a usable image.", "BAD_PAGE");
  }

  if (!Number.isFinite(variant?.price) || (variant?.price ?? 0) <= 0) {
    addFlag("invalid_price", "Product price is missing or invalid.", "BAD_PAGE");
  }

  if (!hasText(variant?.descriptionHtml)) {
    addFlag("missing_description", "Product description/body is empty.", "BAD_PAGE");
  }

  if (!hasText(variant?.title) || isMalformedTitle(variant?.title ?? input.supplierProduct.title)) {
    addFlag("unclear_title", "Product title is missing or unclear.", "NEEDS_DATA_CLEANUP");
  }

  if (!hasText(variant?.vendor)) {
    addFlag("missing_vendor", "Product vendor is missing.", "NEEDS_DATA_CLEANUP");
  }

  if (!hasText(variant?.productType)) {
    addFlag("missing_product_type", "Product type is missing.", "NEEDS_DATA_CLEANUP");
  }

  if (!hasText(variant?.productForm)) {
    addFlag("missing_product_form", "Product form metafield is missing.", "NEEDS_DATA_CLEANUP");
  }

  if (!hasUsefulTags(tags)) {
    addFlag("weak_tags", "Product tags are missing or too weak for filters/collections.", "NEEDS_DATA_CLEANUP");
  }

  const promotionStatus = selectPromotionStatus(statusCandidates);
  return {
    supplierId: input.supplierProduct.supplierId,
    supplierName: input.supplierProduct.supplierName,
    productId: variant?.productId,
    variantId: variant?.variantId,
    title: variant?.title || input.supplierProduct.title,
    vendor: variant?.vendor || input.supplierProduct.brand || input.supplierProduct.supplierName,
    sku: input.supplierProduct.sku || variant?.sku,
    productUrl: input.supplierProduct.productUrl,
    promotionStatus,
    matchConfidence: roundConfidence(input.matchConfidence),
    flags,
    reasons,
    price: variant?.price,
    stockStatus: input.supplierProduct.stockStatus,
  };

  function addFlag(flag: string, reason: string, status: PromotionStatus): void {
    flags.push(flag);
    reasons.push(reason);
    statusCandidates.push(status);
  }
}

export function buildProductOpsRunOutput(input: BuildProductOpsRunOutputInput): ProductOpsRunOutput {
  const results = input.supplierProducts.map((supplierProduct) => {
    const productIssues = input.issues.filter((issue) => issueMatchesProduct(issue, supplierProduct));
    const match = matchSupplierProduct(supplierProduct, input.shopifyVariants, input.mappings);

    if (match.status === "matched") {
      return evaluateProductReadiness({
        supplierProduct,
        shopifyVariant: match.variant,
        matchConfidence: match.confidence,
        issues: productIssues,
        lowStockThreshold: input.lowStockThreshold,
      });
    }

    const syntheticIssue: BlockedIssue = {
      kind: "match_uncertain",
      supplierProduct,
      shopifyVariant: match.status === "blocked" ? match.candidate?.variant : undefined,
      reason: match.reason,
      data: match.status === "blocked" ? { matchConfidence: match.candidate?.confidence ?? 0 } : undefined,
    };

    return evaluateProductReadiness({
      supplierProduct,
      shopifyVariant: syntheticIssue.shopifyVariant,
      matchConfidence: match.status === "blocked" ? match.candidate?.confidence ?? 0 : 0,
      issues: [...productIssues, syntheticIssue],
      lowStockThreshold: input.lowStockThreshold,
    });
  });

  const productsToPromote = results.filter((result) => result.promotionStatus === "PROMOTE_READY");
  const productsToAvoid = results.filter((result) => result.promotionStatus !== "PROMOTE_READY");
  const promotionTasks = productsToPromote.map((result) => taskForProduct(result));
  const cleanupTasks = results
    .filter((result) => result.promotionStatus === "NEEDS_DATA_CLEANUP" || result.promotionStatus === "BAD_PAGE")
    .map((result) => taskForProduct(result));
  const reviewTasks = results
    .filter((result) =>
      ["REVIEW_REQUIRED", "DO_NOT_PROMOTE", "OUT_OF_STOCK", "LOW_STOCK"].includes(result.promotionStatus),
    )
    .map((result) => taskForProduct(result));
  const errors = input.issues.filter(isOperationalError).map(issueToError);

  return {
    runId: input.runId,
    agent: "product_ops",
    runType: input.runType ?? "full_product_ops_check",
    mode: input.dryRun ? "dry_run" : "apply_changes",
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    summary: {
      productsChecked: input.supplierProducts.length,
      variantsChecked: input.shopifyVariants.length,
      suppliersChecked: input.supplierCount,
      promoteReady: countStatus(results, "PROMOTE_READY"),
      lowStock: countStatus(results, "LOW_STOCK"),
      outOfStock: countStatus(results, "OUT_OF_STOCK"),
      needsDataCleanup: countStatus(results, "NEEDS_DATA_CLEANUP"),
      badPage: countStatus(results, "BAD_PAGE"),
      doNotPromote: countStatus(results, "DO_NOT_PROMOTE"),
      reviewRequired: countStatus(results, "REVIEW_REQUIRED"),
      errors: errors.length,
    },
    productsToPromote,
    productsToAvoid,
    promotionTasks,
    cleanupTasks,
    reviewTasks,
    errors,
    plannedChanges: input.changes,
    blockedIssues: input.issues,
  };
}

function taskForProduct(product: ProductOpsProductResult): ProductOpsTask {
  if (product.promotionStatus === "PROMOTE_READY") {
    return {
      actionType: "PROMOTE",
      title: `Product is promote-ready for ${product.title}.`,
      detail: "Product passed supplier, inventory, page, and metadata readiness checks.",
      ...taskProductFields(product),
    };
  }

  if (product.promotionStatus === "BAD_PAGE" || product.promotionStatus === "NEEDS_DATA_CLEANUP") {
    return {
      actionType: "FIX",
      title: `Fix Product Ops readiness for ${product.title}.`,
      detail: product.reasons.join(" "),
      ...taskProductFields(product),
    };
  }

  const title =
    product.promotionStatus === "REVIEW_REQUIRED"
      ? `Supplier match uncertain or guardrail blocked for ${product.title}.`
      : `Do not promote ${product.title} until Product Ops clears it.`;

  return {
    actionType: "REVIEW",
    title,
    detail: product.reasons.join(" "),
    ...taskProductFields(product),
  };
}

function taskProductFields(product: ProductOpsProductResult) {
  return {
    promotionStatus: product.promotionStatus,
    supplierId: product.supplierId,
    productId: product.productId,
    variantId: product.variantId,
    sku: product.sku,
  };
}

function selectPromotionStatus(candidates: PromotionStatus[]): PromotionStatus {
  return PROMOTION_PRIORITY.find((status) => candidates.includes(status)) ?? "PROMOTE_READY";
}

function countStatus(results: ProductOpsProductResult[], status: PromotionStatus): number {
  return results.filter((result) => result.promotionStatus === status).length;
}

function issueMatchesProduct(issue: BlockedIssue, supplierProduct: SupplierProduct): boolean {
  const issueProduct = issue.supplierProduct;
  if (!issueProduct) {
    return false;
  }

  return (
    issueProduct.supplierId === supplierProduct.supplierId &&
    ((issueProduct.sku && supplierProduct.sku && issueProduct.sku === supplierProduct.sku) ||
      (issueProduct.upc && supplierProduct.upc && issueProduct.upc === supplierProduct.upc) ||
      issueProduct.title === supplierProduct.title)
  );
}

function isOperationalError(issue: BlockedIssue): boolean {
  return issue.kind === "supplier_error" || issue.kind === "shopify_error";
}

function issueToError(issue: BlockedIssue): ProductOpsError {
  return {
    source: issue.kind === "supplier_error" ? "supplier" : "shopify",
    kind: issue.kind,
    message: issue.reason,
    supplierId: String(issue.data?.supplierId ?? issue.supplierProduct?.supplierId ?? ""),
  };
}

function hasText(value: string | undefined | null): boolean {
  return stripHtml(value ?? "").trim().length > 0;
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
}

function isMalformedTitle(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.length < 3 || normalized === "untitled" || normalized === "product";
}

function hasUsefulTags(tags: string[]): boolean {
  const genericTags = new Set(["product", "products", "supplement", "supplements"]);
  return tags.some((tag) => tag.length > 2 && !genericTags.has(tag));
}

function roundConfidence(value: number): number {
  return Math.round(value * 100) / 100;
}
