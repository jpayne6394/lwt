import type { MarketSignal } from "./types.ts";

export async function fetchOpenWebSignals(urls: string[], now = new Date().toISOString()): Promise<MarketSignal[]> {
  const signals: MarketSignal[] = [];

  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        continue;
      }
      const text = await response.text();
      const title = extractTitle(text) ?? url;
      const keywords = extractKeywords(`${title} ${text}`);
      signals.push({
        sourceId: "open-web",
        sourceLabel: "Open Web",
        topic: keywords.slice(0, 2).join(" ") || title,
        title,
        url,
        capturedAt: now,
        keywords,
      });
    } catch {
      // Optional market sources should never block core Shopify operations.
    }
  }

  return signals;
}

function extractTitle(html: string): string | null {
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  if (title) {
    return decodeBasicEntities(title);
  }
  return null;
}

function extractKeywords(text: string): string[] {
  const common = new Set(["with", "from", "that", "this", "have", "your", "about", "into", "wellness", "health"]);
  const counts = new Map<string, number>();
  for (const word of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    if (word.length < 4 || common.has(word)) {
      continue;
    }
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)
    .slice(0, 8);
}

function decodeBasicEntities(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
