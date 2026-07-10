import type { ShopperSearchTerm } from "./intelligenceTypes.ts";

export function normalizeSearchTerm(value: string): string {
  return value.toLowerCase().replace(/[^\w\s/-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function titleCase(value: string): string {
  return normalizeSearchTerm(value).replace(/\w\S*/g, (part) => part[0].toUpperCase() + part.slice(1).toLowerCase());
}

export function buildShopperSearchSignals(terms: ShopperSearchTerm[]) {
  const sorted = [...terms].sort((left, right) => right.searchCount - left.searchCount);
  const noResultSearches = sorted.filter((term) => (term.noResultsCount ?? 0) > 0);
  const noClickSearches = sorted.filter((term) => (term.noClickCount ?? 0) > 0 || lowClickRate(term));
  return {
    topSearches: sorted.slice(0, 12),
    risingSearches: sorted.filter((term) => Boolean(term.scoreJson.rising)).slice(0, 12),
    noResultSearches: noResultSearches.slice(0, 12),
    noClickSearches: noClickSearches.slice(0, 12),
    missingProductSearches: noResultSearches.slice(0, 12),
    missingCollectionSearches: noResultSearches.filter((term) => term.searchCount >= 25).slice(0, 12),
    blogTopicSearches: sorted.filter((term) => term.searchCount >= 25 || riskyWellnessTerm(term.normalizedTerm)).slice(0, 12),
  };
}

export function safeEducationalAngle(term: string): string {
  const normalized = normalizeSearchTerm(term);
  if (normalized.includes("anxiety")) {
    return "Stress support basics: how to think about practitioner-guided wellness support.";
  }
  if (normalized.includes("parasite")) {
    return "What to know before choosing detox or cleanse support products.";
  }
  if (normalized.includes("thyroid")) {
    return "Questions to ask a practitioner before choosing thyroid wellness support.";
  }
  if (normalized.includes("mold")) {
    return "How to discuss environmental exposure concerns with a practitioner before choosing wellness support.";
  }
  return `${titleCase(term)}: what to know before choosing practitioner-guided wellness support.`;
}

function lowClickRate(term: ShopperSearchTerm): boolean {
  if (!term.clickCount || term.searchCount < 10) {
    return false;
  }
  return term.clickCount / term.searchCount < 0.1;
}

function riskyWellnessTerm(term: string): boolean {
  return ["anxiety", "parasite", "thyroid", "mold"].some((word) => term.includes(word));
}
