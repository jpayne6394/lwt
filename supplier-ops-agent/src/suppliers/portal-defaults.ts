import type { WebsiteAdapterConfig } from "./website-adapter.ts";

/**
 * Non-secret portal structure verified against each supplier's current public
 * sign-in and catalog pages. Credentials and sessions always remain external.
 */
const PORTAL_DEFAULTS: Record<string, WebsiteAdapterConfig> = {
  desbio: {
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
  },
  "research-nutritionals": {
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
  },
  "physicians-standard": {
    loginUrl: "https://www.physiciansstandard.com/account/login",
    productsUrl: "https://www.physiciansstandard.com/collections/all",
    allowedHosts: ["www.physiciansstandard.com"],
    authenticatedSelector: 'a[href="/account/logout"]',
    selectors: {
      username: "#CustomerEmail",
      password: "#CustomerPassword",
      submit: '#customer_login button',
      productRows: "li.grid__item",
    },
  },
};

export function defaultWebsiteConfig(supplierId: string): WebsiteAdapterConfig {
  return PORTAL_DEFAULTS[supplierId] ?? {};
}

export function mergeWebsiteConfig(
  base: WebsiteAdapterConfig,
  override: WebsiteAdapterConfig,
): WebsiteAdapterConfig {
  return {
    ...base,
    ...override,
    selectors:
      base.selectors || override.selectors
        ? {
            username: override.selectors?.username?.trim() || base.selectors?.username || "",
            password: override.selectors?.password?.trim() || base.selectors?.password || "",
            submit: override.selectors?.submit?.trim() || base.selectors?.submit || "",
            productRows: override.selectors?.productRows?.trim() || base.selectors?.productRows,
          }
        : undefined,
  };
}
