import assert from "node:assert/strict";
import test from "node:test";

import { EmersonCatalogSupplierAdapter } from "../src/suppliers/emerson-catalog-adapter.ts";
import { createAdaptersFromEnv } from "../src/suppliers/factory.ts";
import { WebsiteSupplierAdapter } from "../src/suppliers/website-adapter.ts";
import type { SupplierConfig } from "../src/suppliers/types.ts";

const emerson: SupplierConfig = {
  id: "emerson-ecologics",
  name: "Emerson Ecologics",
  mode: "website",
  brands: ["Pure Encapsulations"],
  notes: "",
};

test("factory uses Emerson reusable-session adapter when a captured session exists", () => {
  const [adapter] = createAdaptersFromEnv([emerson], {
    SUPPLIER_COOKIE_EMERSON_ECOLOGICS: "session=private-value",
    SUPPLIER_CATALOG_URLS_EMERSON_ECOLOGICS:
      "https://www.emersonecologics.com/shop,https://www.emersonecologics.com/shop?search=magnesium",
  } as NodeJS.ProcessEnv);
  assert.equal(adapter instanceof EmersonCatalogSupplierAdapter, true);
});

test("factory preserves credential login diagnostics until a reusable Emerson session is connected", () => {
  const [adapter] = createAdaptersFromEnv([emerson], {
    SUPPLIER_USERNAME_EMERSON_ECOLOGICS: "orders@example.test",
    SUPPLIER_PASSWORD_EMERSON_ECOLOGICS: "private-value",
    SUPPLIER_WEBSITE_CONFIG_EMERSON_ECOLOGICS: JSON.stringify({
      loginUrl: "https://emersonecologics.com/login",
      selectors: { username: "#email", password: "#password", submit: "button[type=submit]" },
    }),
  } as NodeJS.ProcessEnv);
  assert.equal(adapter instanceof WebsiteSupplierAdapter, true);
});
