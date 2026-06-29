import type { MatchResult, ProductMapping, ShopifyVariant, SupplierProduct } from "./types.ts";

const TITLE_CONFIDENCE_THRESHOLD = 0.78;
const UNCERTAIN_CONFIDENCE_THRESHOLD = 0.25;

export function matchSupplierProduct(
  supplierProduct: SupplierProduct,
  shopifyVariants: ShopifyVariant[],
  mappings: ProductMapping[],
): MatchResult {
  const manual = findManualMapping(supplierProduct, shopifyVariants, mappings);
  if (manual) {
    return {
      status: "matched",
      strategy: "manual",
      confidence: 1,
      variant: manual,
    };
  }

  const sku = normalizeIdentifier(supplierProduct.sku);
  if (sku) {
    const skuMatches = shopifyVariants.filter((variant) => normalizeIdentifier(variant.sku) === sku);
    if (skuMatches.length > 1) {
      return {
        status: "blocked",
        reason: `Multiple Shopify variants matched supplier SKU ${supplierProduct.sku}`,
      };
    }
    if (skuMatches.length === 1) {
      return {
        status: "matched",
        strategy: "sku",
        confidence: 1,
        variant: skuMatches[0],
      };
    }
  }

  const upc = normalizeIdentifier(supplierProduct.upc);
  if (upc) {
    const upcMatches = shopifyVariants.filter((variant) => normalizeIdentifier(variant.barcode) === upc);
    if (upcMatches.length > 1) {
      return {
        status: "blocked",
        reason: `Multiple Shopify variants matched supplier UPC ${supplierProduct.upc}`,
      };
    }
    if (upcMatches.length === 1) {
      return {
        status: "matched",
        strategy: "upc",
        confidence: 1,
        variant: upcMatches[0],
      };
    }
  }

  return findTitleVendorMatch(supplierProduct, shopifyVariants);
}

function findManualMapping(
  supplierProduct: SupplierProduct,
  shopifyVariants: ShopifyVariant[],
  mappings: ProductMapping[],
): ShopifyVariant | null {
  const sku = normalizeIdentifier(supplierProduct.sku);
  const upc = normalizeIdentifier(supplierProduct.upc);
  const title = normalizeText(supplierProduct.title);

  const mapping = mappings.find((candidate) => {
    if (candidate.supplierId !== supplierProduct.supplierId) {
      return false;
    }

    return (
      (sku && normalizeIdentifier(candidate.supplierSku) === sku) ||
      (upc && normalizeIdentifier(candidate.supplierUpc) === upc) ||
      (title && normalizeText(candidate.supplierTitle ?? "") === title)
    );
  });

  if (!mapping) {
    return null;
  }

  return shopifyVariants.find((variant) => variant.variantId === mapping.shopifyVariantId) ?? null;
}

function findTitleVendorMatch(supplierProduct: SupplierProduct, shopifyVariants: ShopifyVariant[]): MatchResult {
  const supplierTokens = tokenizeProductTitle(supplierProduct.title);
  const supplierBrand = normalizeText(supplierProduct.brand ?? supplierProduct.supplierName);
  const scored = shopifyVariants
    .map((variant) => {
      const titleScore = tokenOverlapScore(supplierTokens, tokenizeProductTitle(variant.title));
      const vendorText = normalizeText(`${variant.vendor} ${variant.title}`);
      const vendorMatches = supplierBrand.length > 0 && vendorText.includes(supplierBrand);
      const score = vendorMatches ? titleScore : titleScore * 0.65;
      return { variant, score, vendorMatches };
    })
    .sort((left, right) => right.score - left.score);

  const best = scored[0];
  if (!best || best.score < UNCERTAIN_CONFIDENCE_THRESHOLD) {
    return {
      status: "unmatched",
      reason: "No matching Shopify product found",
    };
  }

  const tied = scored.filter((candidate) => Math.abs(candidate.score - best.score) < 0.001);
  if (tied.length > 1 && best.score >= TITLE_CONFIDENCE_THRESHOLD) {
    return {
      status: "blocked",
      reason: "Multiple Shopify variants matched supplier title/vendor",
    };
  }

  if (best.score >= TITLE_CONFIDENCE_THRESHOLD && best.vendorMatches) {
    return {
      status: "matched",
      strategy: "title_vendor",
      confidence: roundConfidence(best.score),
      variant: best.variant,
    };
  }

  return {
    status: "blocked",
    reason: "Supplier product resembles an existing Shopify product but not confidently enough to automate",
  };
}

function normalizeIdentifier(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[®™]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokenizeProductTitle(value: string): string[] {
  const stopWords = new Set(["by", "the", "and", "for", "with", "a", "an", "of"]);
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 1 && !stopWords.has(token));
}

function tokenOverlapScore(leftTokens: string[], rightTokens: string[]): number {
  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return 0;
  }

  const right = new Set(rightTokens);
  const matches = leftTokens.filter((token) => right.has(token)).length;
  return matches / Math.max(leftTokens.length, rightTokens.length);
}

function roundConfidence(value: number): number {
  return Math.round(value * 100) / 100;
}

