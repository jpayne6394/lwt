import type { CompetitorPriceSnapshot } from "./types.ts";

export type CompetitorPriceUrl = {
  productHandle: string;
  productTitle: string;
  competitor: string;
  url: string;
};

const PRICE_PATTERN = /\$\s*([0-9]{1,4}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/g;

export function extractCompetitorPrice(text: string): number | null {
  const prices = [...text.matchAll(PRICE_PATTERN)]
    .map((match) => Number(match[1].replace(/,/g, "")))
    .filter((price) => Number.isFinite(price) && price > 0);

  if (!prices.length) {
    return null;
  }

  return Math.min(...prices);
}

export async function fetchCompetitorPriceSnapshots(
  urls: CompetitorPriceUrl[],
  now = new Date().toISOString(),
): Promise<CompetitorPriceSnapshot[]> {
  const snapshots: CompetitorPriceSnapshot[] = [];

  for (const item of urls) {
    try {
      const response = await fetch(item.url);
      if (!response.ok) {
        continue;
      }
      const price = extractCompetitorPrice(await response.text());
      if (price == null) {
        continue;
      }
      snapshots.push({
        productHandle: item.productHandle,
        productTitle: item.productTitle,
        competitor: item.competitor,
        url: item.url,
        price,
        capturedAt: now,
      });
    } catch {
      // Market Radar treats competitor pages as optional evidence, not a sync blocker.
    }
  }

  return snapshots;
}
