import assert from "node:assert/strict";
import test from "node:test";

import { ShopifyContentClient } from "../src/shopify/content-client.ts";
import { ShopifySyncClient } from "../src/shopify/shopify-sync-client.ts";
import type { PlannedChange } from "../src/domain/types.ts";

test("Shopify sync client applies inventory, price, cost, and draft product changes", async () => {
  const calls: Array<{ query: string; variables: unknown }> = [];
  const client = new ShopifySyncClient({
    graphql: async (query, variables) => {
      calls.push({ query, variables });
      if (query.includes("productCreate")) {
        return {
          data: {
            productCreate: {
              product: {
                id: "gid://shopify/Product/99",
                variants: {
                  nodes: [
                    {
                      id: "gid://shopify/ProductVariant/99",
                      inventoryItem: {
                        id: "gid://shopify/InventoryItem/99",
                      },
                    },
                  ],
                },
              },
            },
          },
        };
      }
      return { data: {} };
    },
  });

  const changes: PlannedChange[] = [
    {
      type: "inventory",
      variantId: "gid://shopify/ProductVariant/1",
      inventoryItemId: "gid://shopify/InventoryItem/1",
      locationId: "gid://shopify/Location/10",
      quantity: 10,
      reason: "Supplier in stock without exact quantity",
    },
    {
      type: "price",
      productId: "gid://shopify/Product/1",
      variantId: "gid://shopify/ProductVariant/1",
      price: 48,
      compareAtPrice: 60,
      reason: "Mirroring supplier sale price",
    },
    {
      type: "cost",
      inventoryItemId: "gid://shopify/InventoryItem/1",
      cost: 24,
      reason: "Supplier cost changed",
    },
    {
      type: "draft_product",
      supplierProduct: {
        supplierId: "desbio",
        supplierName: "DesBio",
        sku: "NEW-SKU",
        title: "New Supplier Item",
        brand: "DesBio",
        stockStatus: "in_stock",
        cost: 12,
        msrp: 24,
        capturedAt: "2026-05-24T12:00:00.000Z",
      },
      draftPrice: 24,
      reason: "No matching Shopify product found",
    },
  ];

  await client.applyChanges(changes);

  assert.equal(calls.length, 6);
  assert.match(calls[0].query, /inventorySetQuantities/);
  assert.match(calls[1].query, /productVariantsBulkUpdate/);
  assert.match(calls[2].query, /inventoryItemUpdate/);
  assert.match(calls[3].query, /productCreate/);
  assert.match(calls[4].query, /productVariantsBulkUpdate/);
  assert.match(calls[5].query, /inventoryItemUpdate/);
});

test("Shopify content client creates draft blog articles without publishing", async () => {
  const calls: Array<{ query: string; variables: any }> = [];
  const client = new ShopifyContentClient({
    graphql: async (query, variables) => {
      calls.push({ query, variables });
      if (query.includes("blogs")) {
        return {
          data: {
            blogs: {
              nodes: [
                {
                  id: "gid://shopify/Blog/1",
                  title: "Wellness Blog",
                  handle: "wellness-blog",
                },
              ],
            },
          },
        };
      }
      return {
        data: {
          articleCreate: {
            article: {
              id: "gid://shopify/Article/1",
              title: "Magnesium for Better Sleep",
              handle: "magnesium-for-better-sleep",
            },
            userErrors: [],
          },
        },
      };
    },
  });

  const blogs = await client.listBlogs();
  const article = await client.createDraftArticle({
    blogId: blogs[0].id,
    title: "Magnesium for Better Sleep",
    authorName: "Living Well Today",
    bodyHtml: "<h2>Magnesium for Better Sleep</h2>",
    summary: "A draft article.",
    tags: ["magnesium", "sleep"],
    handle: "magnesium-for-better-sleep",
  });

  assert.equal(article.id, "gid://shopify/Article/1");
  assert.match(calls[0].query, /blogs/);
  assert.match(calls[1].query, /articleCreate/);
  assert.equal(calls[1].variables.article.isPublished, false);
  assert.equal(calls[1].variables.article.blogId, "gid://shopify/Blog/1");
});
