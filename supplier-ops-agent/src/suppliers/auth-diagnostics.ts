import { defaultPublicCatalogConfig } from "./public-catalog-adapter.ts";
import { defaultWebsiteConfig, mergeWebsiteConfig } from "./portal-defaults.ts";
import type { SupplierConfig } from "./types.ts";
import type { WebsiteAdapterConfig } from "./website-adapter.ts";

/** Safe deployment diagnostics. No credential, cookie, account identifier or URL is returned. */
export interface SupplierAuthConfiguration {
  supplierKey: string;
  mode: "feed" | "public_catalog" | "supplier_account";
  usernameConfigured: boolean;
  passwordConfigured: boolean;
  sessionConfigured: boolean;
  automaticReauthenticationSupported: boolean;
  refreshedSessionPersistence: "not_applicable" | "not_supported" | "process_memory_only";
}

export function describeSupplierAuthConfiguration(
  supplier: SupplierConfig,
  env: NodeJS.ProcessEnv = process.env,
): SupplierAuthConfiguration {
  const suffix = supplier.id.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  let override: WebsiteAdapterConfig = {};
  try {
    const value: unknown = JSON.parse(env[`SUPPLIER_WEBSITE_CONFIG_${suffix}`] ?? "{}");
    if (value && typeof value === "object" && !Array.isArray(value)) override = value as WebsiteAdapterConfig;
  } catch { /* Invalid configuration is not echoed into diagnostics. */ }
  const website = mergeWebsiteConfig(defaultWebsiteConfig(supplier.id), override);
  const configured = (value: unknown) => typeof value === "string" && value.trim().length > 0;
  const usernameConfigured = configured(env[`SUPPLIER_USERNAME_${suffix}`] ?? website.username);
  const passwordConfigured = configured(env[`SUPPLIER_PASSWORD_${suffix}`] ?? website.password);
  const sessionConfigured = configured(env[`SUPPLIER_COOKIE_${suffix}`] ?? website.sessionCookieHeader);
  const base = { supplierKey: supplier.id, usernameConfigured, passwordConfigured, sessionConfigured };
  // Keep factory precedence explicit: a readable public catalog is not an authenticated account.
  if (env[`SUPPLIER_FEED_URL_${suffix}`] ?? (supplier.sourceEnvVar ? env[supplier.sourceEnvVar] : undefined)) {
    return { ...base, mode: "feed", automaticReauthenticationSupported: false, refreshedSessionPersistence: "not_applicable" };
  }
  if (defaultPublicCatalogConfig(supplier.id)) {
    return { ...base, mode: "public_catalog", automaticReauthenticationSupported: false, refreshedSessionPersistence: "not_applicable" };
  }
  if (supplier.id === "emerson-ecologics" && env.SUPPLIER_COOKIE_EMERSON_ECOLOGICS) {
    return { ...base, mode: "supplier_account", automaticReauthenticationSupported: false, refreshedSessionPersistence: "not_supported" };
  }
  const automaticReauthenticationSupported = usernameConfigured && passwordConfigured
    && configured(website.loginUrl) && configured(website.productsUrl) && configured(website.authenticatedSelector)
    && configured(website.selectors?.username) && configured(website.selectors?.password) && configured(website.selectors?.submit);
  return { ...base, mode: "supplier_account", automaticReauthenticationSupported, refreshedSessionPersistence: "process_memory_only" };
}
