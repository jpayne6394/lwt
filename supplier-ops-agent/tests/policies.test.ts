import assert from "node:assert/strict";
import test from "node:test";

import { resolveInventoryQuantity } from "../src/domain/inventory-policy.ts";
import { planPriceUpdate } from "../src/domain/pricing-policy.ts";

test("inventory policy uses exact supplier quantity when available", () => {
  assert.deepEqual(resolveInventoryQuantity({ stockStatus: "in_stock", quantity: 7 }), {
    shouldUpdate: true,
    quantity: 7,
  });
});

test("inventory policy maps in-stock without quantity to ten and out-of-stock to zero", () => {
  assert.deepEqual(resolveInventoryQuantity({ stockStatus: "in_stock" }), {
    shouldUpdate: true,
    quantity: 10,
  });

  assert.deepEqual(resolveInventoryQuantity({ stockStatus: "out_of_stock" }), {
    shouldUpdate: true,
    quantity: 0,
  });
});

test("inventory policy blocks unknown supplier stock", () => {
  assert.deepEqual(resolveInventoryQuantity({ stockStatus: "unknown" }), {
    shouldUpdate: false,
    reason: "Supplier stock is unknown",
  });
});

test("pricing policy prefers supplier MSRP over calculated margin", () => {
  assert.deepEqual(
    planPriceUpdate({
      currentPrice: 60,
      supplierCost: 20,
      supplierMsrp: 55,
    }),
    {
      shouldUpdate: true,
      price: 55,
      compareAtPrice: null,
      reason: "Using supplier MSRP/list price",
    },
  );
});

test("pricing policy falls back to two-times cost when MSRP is unavailable", () => {
  assert.deepEqual(
    planPriceUpdate({
      currentPrice: 35,
      supplierCost: 18.25,
    }),
    {
      shouldUpdate: true,
      price: 36.5,
      compareAtPrice: null,
      reason: "Using 2x cost fallback",
    },
  );
});

test("pricing policy mirrors supplier sale pricing with compare-at price", () => {
  assert.deepEqual(
    planPriceUpdate({
      currentPrice: 60,
      supplierCost: 20,
      supplierMsrp: 60,
      supplierSalePrice: 48,
    }),
    {
      shouldUpdate: true,
      price: 48,
      compareAtPrice: 60,
      reason: "Mirroring supplier sale price",
    },
  );
});

test("pricing policy blocks price swings over 25 percent", () => {
  assert.deepEqual(
    planPriceUpdate({
      currentPrice: 60,
      supplierCost: 20,
      supplierMsrp: 90,
    }),
    {
      shouldUpdate: false,
      reason: "Price change exceeds 25% guardrail",
      blockedPrice: 90,
      currentPrice: 60,
    },
  );
});
