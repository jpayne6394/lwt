import type { MatchResult, ProductMapping, ShopifyVariant, SupplierProduct } from "./types.ts";

const TITLE_CONFIDENCE_THRESHOLD = 0.78;
const UNCERTAIN_CONFIDENCE_THRESHOLD = 0.45;

const BASE_STOP_WORDS = new Set(["by", "the", "and", "for", "with", "a", "an", "of"]);
const FORMAT_STOP_WORDS = new Set([
  "bottle",
  "caps",
  "cap",
  "capsule",
  "capsules",
  "count",
  "ct",
  "fl",
  "floz",
  "g",
  "gel",
  "grams",
  "ml",
  "oz",
  "sachet",
  "sachets",
  "softgel",
  "softgels",
  "tab",
  "tabs",
  "tablet",
  "tablets",
  "vial",
  "vials",
]);
const GENERIC_TITLE_STOP_WORDS = new Set(["care", "product", "products", "supplement", "supplements"]);

const BRAND_ALIASES = new Map([
  ["research nutritional", "researched nutritionals"],
  ["research nutritionals", "researched nutritionals"],
  ["researched nutritional", "researched nutritionals"],
  ["researched nutritionals", "researched nutritionals"],
  ["physician standard", "physicians standard"],
  ["physician s standard", "physicians standard"],
  ["physicians standard", "physicians standard"],
  ["physicians standards", "physicians standard"],
  ["des bio", "desbio"],
  ["deseret biologicals", "desbio"],
  ["desbio", "desbio"],
]);

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
  const supplierBrand = canonicalBrand(supplierProduct.brand ?? supplierProduct.supplierName);
  const scored = shopifyVariants
    .map((variant) => {
      const titleStopWords = titleStopWordsForBrands(supplierBrand, variant.vendor);
      const supplierTokens = tokenizeProductTitle(supplierProduct.title, titleStopWords);
      const titleScore = tokenOverlapScore(supplierTokens, tokenizeProductTitle(variant.title, titleStopWords));
      const vendorMatches = brandMatches(supplierBrand, variant);
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
    candidate: {
      variant: best.variant,
      confidence: roundConfidence(best.score),
    },
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

function tokenizeProductTitle(value: string, additionalStopWords: Set<string> = new Set()): string[] {
  return normalizeText(value)
    .split(" ")
    .filter(
      (token) =>
        token.length > 1 &&
        !BASE_STOP_WORDS.has(token) &&
        !FORMAT_STOP_WORDS.has(token) &&
        !GENERIC_TITLE_STOP_WORDS.has(token) &&
        !additionalStopWords.has(token) &&
        !isQuantityFormatToken(token),
    );
}

function tokenOverlapScore(leftTokens: string[], rightTokens: string[]): number {
  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return 0;
  }

  const right = new Set(rightTokens);
  const matches = leftTokens.filter((token) => right.has(token)).length;
  if (matches === 0) {
    return 0;
  }

  const coverage = matches / Math.min(leftTokens.length, rightTokens.length);
  const balance = matches / Math.max(leftTokens.length, rightTokens.length);
  return (coverage + balance) / 2;
}

function roundConfidence(value: number): number {
  return Math.round(value * 100) / 100;
}

function titleStopWordsForBrands(supplierBrand: string, shopifyVendor: string): Set<string> {
  return new Set([...brandTokens(supplierBrand), ...brandTokens(canonicalBrand(shopifyVendor))]);
}

function brandTokens(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 1);
}

function canonicalBrand(value: string): string {
  const normalized = normalizeText(value);
  return BRAND_ALIASES.get(normalized) ?? normalized;
}

function brandMatches(supplierBrand: string, variant: ShopifyVariant): boolean {
  if (supplierBrand.length === 0) {
    return false;
  }

  const variantVendor = canonicalBrand(variant.vendor);
  return variantVendor === supplierBrand || canonicalizeBrandAliases(variant.title).includes(supplierBrand);
}

function canonicalizeBrandAliases(value: string): string {
  let normalized = normalizeText(value);
  for (const [alias, canonical] of BRAND_ALIASES) {
    normalized = normalized.replace(new RegExp(`\\b${escapeRegExp(alias)}\\b`, "g"), canonical);
  }
  return normalized;
}

function isQuantityFormatToken(token: string): boolean {
  return /^\d+$/.test(token) || /^\d+(caps?|capsules?|tabs?|tablets?|ct|count|ml|oz|floz|fl|g|grams?|vcaps?|vegcaps?|softgels?|vials?)$/.test(token);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

