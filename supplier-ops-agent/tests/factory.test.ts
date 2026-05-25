import assert from "node:assert/strict";
import test from "node:test";

import { EmersonCatalogSupplierAdapter } from "../src/suppliers/emerson-catalog-adapter.ts";
import { defaultFeedUrlForSupplier } from "../src/suppliers/factory.ts";
import { createAdaptersFromEnv } from "../src/suppliers/factory.ts";
import { WebsiteSupplierAdapter } from "../src/suppliers/website-adapter.ts";
import type { SupplierConfig } from "../src/suppliers/types.ts";

test("defaultFeedUrlForSupplier uses public feeds for supported supplier sites", () => {
  assert.equal(
    defaultFeedUrlForSupplier("physicians-standard"),
    "https://www.physiciansstandard.com/products.json?limit=250",
  );
  assert.equal(
    defaultFeedUrlForSupplier("desbio"),
    "https://desbio.com/wp-json/wc/store/v1/products?per_page=100",
  );
  assert.equal(
    defaultFeedUrlForSupplier("research-nutritionals"),
    "https://www.researchednutritionals.com/wp-json/wc/store/v1/products?per_page=100",
  );
});

test("createAdaptersFromEnv uses Emerson catalog adapter with cookie capture env vars", () => {
  const suppliers: SupplierConfig[] = [
    {
      id: "emerson-ecologics",
      name: "Emerson Ecologics",
      mode: "website",
      brands: ["Pure Encapsulations"],
      notes: "",
    },
  ];

  const adapters = createAdaptersFromEnv(suppliers, {
    SUPPLIER_COOKIE_EMERSON_ECOLOGICS: "session=abc123",
    SUPPLIER_CATALOG_URLS_EMERSON_ECOLOGICS: [
      "https://www.emersonecologics.com/shop",
      "https://www.emersonecologics.com/shop?search=magnesium",
    ].join("\n"),
  } as NodeJS.ProcessEnv);

  assert.equal(adapters[0] instanceof EmersonCatalogSupplierAdapter, true);
});

test("createAdaptersFromEnv skips unconfigured portal-only suppliers by default", () => {
  const suppliers: SupplierConfig[] = [
    {
      id: "systemic-formulas",
      name: "Systemic Formulas",
      mode: "website",
      brands: ["Systemic Formulas"],
      notes: "",
    },
  ];

  assert.equal(createAdaptersFromEnv(suppliers, {}).length, 0);
});

test("createAdaptersFromEnv includes portal-only suppliers when website config exists", () => {
  const suppliers: SupplierConfig[] = [
    {
      id: "systemic-formulas",
      name: "Systemic Formulas",
      mode: "website",
      brands: ["Systemic Formulas"],
      notes: "",
    },
  ];

  const adapters = createAdaptersFromEnv(suppliers, {
    SUPPLIER_WEBSITE_CONFIG_SYSTEMIC_FORMULAS:
      '{"loginUrl":"https://example.com/login","productsUrl":"https://example.com/products","selectors":{"username":"#email","password":"#password","submit":"button","productRows":"[data-product-row]"}}',
  } as NodeJS.ProcessEnv);

  assert.equal(adapters.length, 1);
  assert.equal(adapters[0] instanceof WebsiteSupplierAdapter, true);
});
