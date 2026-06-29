import assert from "node:assert/strict";
import test from "node:test";

import { createSupplierRegistry } from "../src/suppliers/registry.ts";
import { normalizeSupplierRecord } from "../src/suppliers/normalization.ts";

test("supplier normalization maps mixed source records into the shared product shape", () => {
  assert.deepEqual(
    normalizeSupplierRecord({
      supplierId: "desbio",
      supplierName: "DesBio",
      record: {
        brand: "DesBio",
        sku: " MOLD ",
        upc: "123456789012",
        title: "MOLD:PLUS",
        available: "yes",
        quantity: "4",
        cost: "$17.95",
        msrp: "$36.00",
        sale_price: "$30",
        url: "https://example.com/mold",
        image: "https://example.com/mold.png",
      },
      capturedAt: "2026-05-24T12:00:00.000Z",
    }),
    {
      supplierId: "desbio",
      supplierName: "DesBio",
      brand: "DesBio",
      sku: "MOLD",
      upc: "123456789012",
      title: "MOLD:PLUS",
      stockStatus: "in_stock",
      quantity: 4,
      cost: 17.95,
      msrp: 36,
      salePrice: 30,
      productUrl: "https://example.com/mold",
      imageUrls: ["https://example.com/mold.png"],
      capturedAt: "2026-05-24T12:00:00.000Z",
    },
  );
});

test("supplier registry includes the v1 supplier coverage", () => {
  assert.deepEqual(
    createSupplierRegistry().map((supplier) => supplier.id),
    [
      "emerson-ecologics",
      "bioresource-pekana",
      "systemic-formulas",
      "research-nutritionals",
      "world-health-mall",
      "desbio",
    ],
  );
});
