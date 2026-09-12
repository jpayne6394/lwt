import assert from "node:assert/strict";
import test from "node:test";

import { EmersonCatalogSupplierAdapter } from "../src/suppliers/emerson-catalog-adapter.ts";
import { createAdaptersFromEnv } from "../src/suppliers/factory.ts";
import { WebsiteSupplierAdapter } from "../src/suppliers/website-adapter.ts";
import type { SupplierConfig } from "../src/suppliers/types.ts";
import { defaultWebsiteConfig, mergeWebsiteConfig } from "../src/suppliers/portal-defaults.ts";

const emerson: SupplierConfig = {
  id: "emerson-ecologics",
  name: "Emerson Ecologics",
  mode: "website",
  brands: ["Pure Encapsulations"],
  notes: "",
};

const desbio: SupplierConfig = {
  id: "desbio",
  name: "DesBio",
  mode: "website",
  brands: ["DesBio"],
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

test("factory supplies an isolated reusable session to every configured website supplier", async () => {
  const [adapter] = createAdaptersFromEnv([desbio], {
    SUPPLIER_COOKIE_DESBIO: "session=private-value",
    SUPPLIER_WEBSITE_CONFIG_DESBIO: JSON.stringify({
      productsUrl: "https://portal.desbio.com/products",
      allowedHosts: ["portal.desbio.com"],
      authenticatedSelector: "[data-account-menu]",
      selectors: {
        username: "#email",
        password: "#password",
        submit: "button[type=submit]",
        productRows: "[data-product-row]",
      },
    }),
  } as NodeJS.ProcessEnv);

  assert.equal(adapter instanceof WebsiteSupplierAdapter, true);
});

test("reviewed portal defaults keep non-secret site structure out of deployment settings", () => {
  assert.deepEqual(defaultWebsiteConfig("desbio"), {
    loginUrl: "https://desbio.com/my-account/",
    productsUrl: "https://desbio.com/shop/",
    allowedHosts: ["desbio.com"],
    authenticatedSelector: "body.logged-in",
    selectors: {
      username: 'input[name="user_login"]',
      password: 'input[name="user_password"]',
      submit: ".login-form button[type=submit]",
      productRows: "li.product",
    },
  });
  assert.deepEqual(defaultWebsiteConfig("research-nutritionals"), {
    loginUrl: "https://www.researchednutritionals.com/my-account/",
    productsUrl: "https://www.researchednutritionals.com/shop/",
    allowedHosts: ["www.researchednutritionals.com"],
    authenticatedSelector: "body.logged-in",
    selectors: {
      username: "#username",
      password: "#password",
      submit: "button[name=login]",
      productRows: "li.product",
    },
  });
  assert.deepEqual(defaultWebsiteConfig("physicians-standard"), {
    loginUrl: "https://www.physiciansstandard.com/account/login",
    productsUrl: "https://www.physiciansstandard.com/collections/all",
    allowedHosts: ["www.physiciansstandard.com"],
    authenticatedSelector: 'a[href="/account/logout"]',
    selectors: {
      username: "#CustomerEmail",
      password: "#CustomerPassword",
      submit: "#customer_login button",
      productRows: "li.grid__item",
    },
  });
  assert.deepEqual(defaultWebsiteConfig("world-health-mall"), {});
});

test("portal overrides can update one selector without erasing reviewed defaults", () => {
  const merged = mergeWebsiteConfig(defaultWebsiteConfig("desbio"), {
    selectors: { username: "#new-user", password: "", submit: "" },
  });
  assert.equal(merged.selectors?.username, "#new-user");
  assert.equal(merged.selectors?.password, 'input[name="user_password"]');
  assert.equal(merged.productsUrl, "https://desbio.com/shop/");
});
