import type { ShopifyVariant } from "../domain/types.ts";
import type { ContentIdea, ShopperProductSignal, ShopperRecommendation, ShopperSearchTerm } from "./intelligenceTypes.ts";
import { normalizeSearchTerm, safeEducationalAngle, titleCase } from "./shopperSearchAnalyzer.ts";

export type BuildBehaviorRecommendationsInput = {
  searchTerms: ShopperSearchTerm[];
  productSignals: ShopperProductSignal[];
  shopifyVariants: ShopifyVariant[];
  contentIdeas: ContentIdea[];
};

export function buildBehaviorRecommendations(input: BuildBehaviorRecommendationsInput): {
  recommendations: Omit<ShopperRecommendation, "id" | "createdAt" | "status">[];
  contentOpportunities: Omit<ShopperRecommendation, "id" | "createdAt" | "status">[];
} {
  const recommendations: Omit<ShopperRecommendation, "id" | "createdAt" | "status">[] = [];
  const contentOpportunities: Omit<ShopperRecommendation, "id" | "createdAt" | "status">[] = [];

  for (const term of input.searchTerms) {
    if ((term.noResultsCount ?? 0) > 0) {
      recommendations.push({
        recommendationType: "missing_collection",
        title: `Create collection or content around ${titleCase(term.term)}.`,
        explanation: `${term.searchCount} shoppers searched for ${term.term}, and ${term.noResultsCount ?? 0} searches had no result. This points to a product, collection, synonym, or education gap.`,
        relatedTerm: term.term,
        priority: priorityForCounts(term.searchCount, term.noResultsCount ?? 0),
        source: term.source,
        dateRange: term.dateRange,
        suggestedAction: `Review search synonyms, collection coverage, and educational content for ${term.term}.`,
      });
    }

    if ((term.noClickCount ?? 0) > 0 || lowClickRate(term)) {
      recommendations.push({
        recommendationType: "synonym_needed",
        title: `Add search synonym or improve results for ${titleCase(term.term)}.`,
        explanation: `${term.term} has search activity but weak clicks. Results may not match shopper language or intent.`,
        relatedTerm: term.term,
        priority: term.searchCount >= 75 ? "Critical" : "Watch",
        source: term.source,
        dateRange: term.dateRange,
        suggestedAction: "Add search synonyms, review merchandising, or improve category navigation.",
      });
    }

    const lowStockVariant = findMatchingLowStockVariant(term, input.shopifyVariants);
    if (lowStockVariant) {
      recommendations.push({
        recommendationType: "high_interest_low_stock",
        title: `Do not push ${lowStockVariant.title} until inventory is reviewed.`,
        explanation: `${term.term} has shopper interest, but ${lowStockVariant.title} has low inventory. Featuring it now could create a poor buying experience.`,
        relatedTerm: term.term,
        relatedProductId: lowStockVariant.productId,
        relatedProductTitle: lowStockVariant.title,
        priority: "Critical",
        source: "behavior_recommendation_engine",
        dateRange: term.dateRange,
        suggestedAction: "Review availability before homepage, collection, or content promotion.",
      });
    }

    const matchingIdea = input.contentIdeas.find((idea) => termMatchesIdea(term, idea));
    if (matchingIdea) {
      contentOpportunities.push({
        recommendationType: "blog_topic_opportunity",
        title: `Prioritize blog brief: ${matchingIdea.suggestedTitle}`,
        explanation: `${matchingIdea.topic} is confirmed by shopper behavior from store search demand. Use the existing Content Radar brief workflow and keep claims educational.`,
        relatedTerm: term.term,
        priority: term.searchCount >= 75 ? "Critical" : "Watch",
        source: "behavior_recommendation_engine",
        dateRange: term.dateRange,
        suggestedAction: matchingIdea.suggestedCta,
      });
    } else if (term.searchCount >= 25) {
      contentOpportunities.push({
        recommendationType: "blog_topic_opportunity",
        title: `Create educational content for ${titleCase(term.term)}.`,
        explanation: safeEducationalAngle(term.term),
        relatedTerm: term.term,
        priority: term.searchCount >= 75 ? "Critical" : "Watch",
        source: term.source,
        dateRange: term.dateRange,
        suggestedAction: "Draft a practitioner-guided blog brief before creating publishable copy.",
      });
    }
  }

  for (const signal of input.productSignals) {
    if (signal.signalType === "high_views_low_cart") {
      recommendations.push({
        recommendationType: "product_page_copy_issue",
        title: `Improve product page for ${signal.productTitle}.`,
        explanation: `${signal.reason} Review copy clarity, images, trust cues, practitioner context, and whether the page matches shopper intent.`,
        relatedProductId: signal.shopifyProductId,
        relatedProductTitle: signal.productTitle,
        priority: signal.priority,
        source: signal.source,
        dateRange: signal.dateRange,
        suggestedAction: "Improve product page copy, FAQ, imagery, or navigation context.",
      });
    }
    if (signal.signalType === "high_cart_low_purchase") {
      recommendations.push({
        recommendationType: "high_cart_low_purchase",
        title: `Review checkout friction for ${signal.productTitle}.`,
        explanation: `${signal.reason} Review price, shipping, trust information, and checkout friction before pushing the product harder.`,
        relatedProductId: signal.shopifyProductId,
        relatedProductTitle: signal.productTitle,
        priority: signal.priority,
        source: signal.source,
        dateRange: signal.dateRange,
        suggestedAction: "Review product page, price, shipping, and trust details.",
      });
    }
  }

  return {
    recommendations: dedupeRecommendations(recommendations),
    contentOpportunities: dedupeRecommendations(contentOpportunities),
  };
}

function priorityForCounts(searchCount: number, issueCount: number): "Critical" | "Watch" | "Normal" {
  if (searchCount >= 75 && issueCount >= 20) return "Critical";
  if (searchCount >= 25 || issueCount >= 5) return "Watch";
  return "Normal";
}

function lowClickRate(term: ShopperSearchTerm): boolean {
  if (!term.clickCount || term.searchCount < 10) return false;
  return term.clickCount / term.searchCount < 0.1;
}

function findMatchingLowStockVariant(term: ShopperSearchTerm, variants: ShopifyVariant[]): ShopifyVariant | undefined {
  const normalizedTerm = normalizeSearchTerm(term.term);
  return variants.find((variant) => {
    const quantity = variant.inventoryQuantity ?? 0;
    if (quantity > 2) return false;
    const title = normalizeSearchTerm(variant.title);
    return title.split(" ").some((part) => part.length > 3 && normalizedTerm.includes(part));
  });
}

function termMatchesIdea(term: ShopperSearchTerm, idea: ContentIdea): boolean {
  const normalizedTerm = normalizeSearchTerm(term.term);
  const normalizedTopic = normalizeSearchTerm(idea.topic);
  return normalizedTopic.split(" ").some((part) => part.length > 3 && normalizedTerm.includes(part));
}

function dedupeRecommendations<T extends Omit<ShopperRecommendation, "id" | "createdAt" | "status">>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = [item.recommendationType, item.title, item.relatedTerm, item.relatedProductId].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
