import { claimWarnings } from "../market-radar/market-radar-service.ts";
import type { BlogDraftRecord, BlogStyleProfile, BuildBlogDraftInput } from "./types.ts";

export const WELLNESS_BLOG_PROFILES: BlogStyleProfile[] = [
  {
    id: "educational-guide",
    label: "Educational guide",
    summary: "A clear wellness explainer with practical takeaways and related products.",
    sections: ["What people are asking", "What to know", "How to shop this topic", "Related products"],
  },
  {
    id: "product-spotlight",
    label: "Product spotlight",
    summary: "A concise product-led article that explains use case, ingredients, and fit.",
    sections: ["Why this product is on our radar", "Who may like it", "Product notes", "Shop next"],
  },
  {
    id: "practitioner-note",
    label: "Practitioner note",
    summary: "A calmer note-style article written with a helpful practitioner tone.",
    sections: ["Quick note", "What we look for", "Gentle next steps", "Products mentioned"],
  },
  {
    id: "protocol-how-to",
    label: "Protocol / how-to",
    summary: "A structured how-to with steps, timing, cautions, and product support.",
    sections: ["Goal", "Step-by-step", "Helpful cautions", "Supporting products"],
  },
  {
    id: "sale-announcement",
    label: "Sale announcement",
    summary: "A short promotional article for a sale, restock, bundle, or seasonal push.",
    sections: ["What is featured", "Why now", "How to choose", "Shop the offer"],
  },
];

export function buildBlogDraft(input: BuildBlogDraftInput): BlogDraftRecord {
  const now = input.now ?? new Date().toISOString();
  const profile = WELLNESS_BLOG_PROFILES.find((candidate) => candidate.id === input.profileId) ?? WELLNESS_BLOG_PROFILES[0];
  const title = input.title.trim() || "Untitled wellness draft";
  const relatedProducts = input.relatedProducts ?? [];
  const titleWords = title.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const tags = uniqueTags([
    ...relatedProducts.flatMap((product) => product.tags),
    ...titleWords,
    "market-radar",
  ]).slice(0, 12);

  return {
    id: `blog_${Date.now()}_${hashText(`${profile.id}:${title}`)}`,
    title,
    profileId: profile.id,
    profileLabel: profile.label,
    status: "DRAFT_READY",
    authorName: input.authorName ?? "Living Well Today",
    bodyHtml: buildBodyHtml({ profile, title, roughThoughts: input.roughThoughts, relatedProducts }),
    summary: `${profile.label} template draft for ${title}. ${profile.summary}`,
    tags,
    handle: slugify(title),
    relatedProducts,
    claimWarnings: claimWarnings(`${title} ${input.roughThoughts}`),
    createdAt: now,
    updatedAt: now,
  };
}

function buildBodyHtml(input: {
  profile: BlogStyleProfile;
  title: string;
  roughThoughts: string;
  relatedProducts: BuildBlogDraftInput["relatedProducts"];
}): string {
  const thoughts = escapeHtml(input.roughThoughts.trim() || "Add the main idea for this article before publishing.");
  const products = input.relatedProducts ?? [];
  const productList = products.length
    ? `<ul>${products
        .map((product) => `<li><strong>${escapeHtml(product.title)}</strong> - ${escapeHtml(product.vendor)} (${escapeHtml(product.sku || "no SKU")})</li>`)
        .join("")}</ul>`
    : `<p>No related products selected yet.</p>`;

  const sections = input.profile.sections
    .map((section, index) => {
      if (index === 0) {
        return `<h2>${escapeHtml(section)}</h2><p>${thoughts}</p>`;
      }
      if (/product/i.test(section) || /shop/i.test(section)) {
        return `<h2>${escapeHtml(section)}</h2>${productList}`;
      }
      return `<h2>${escapeHtml(section)}</h2><p>Use this section to connect the Market Radar evidence to a clear, helpful customer takeaway.</p>`;
    })
    .join("");

  return `<article><h1>${escapeHtml(input.title)}</h1>${sections}<p><em>This draft is template-built and should be reviewed before publishing.</em></p></article>`;
}

function uniqueTags(values: string[]): string[] {
  const tags = new Set<string>();
  for (const value of values) {
    const cleaned = value.toLowerCase().trim().replace(/[^a-z0-9 -]/g, "");
    if (cleaned.length >= 3) {
      tags.add(cleaned);
    }
  }
  return [...tags];
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function hashText(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
