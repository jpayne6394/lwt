import { JsonFeedSupplierAdapter } from "./json-feed-adapter.ts";
import type { SupplierAdapter, SupplierConfig } from "./types.ts";
import { WebsiteSupplierAdapter, type WebsiteAdapterConfig } from "./website-adapter.ts";

export function createAdaptersFromEnv(suppliers: SupplierConfig[], env: NodeJS.ProcessEnv = process.env): SupplierAdapter[] {
  return suppliers.map((supplier) => {
    const suffix = toEnvSuffix(supplier.id);
    const feedUrl = env[`SUPPLIER_FEED_URL_${suffix}`] ?? (supplier.sourceEnvVar ? env[supplier.sourceEnvVar] : undefined);

    if (feedUrl) {
      return new JsonFeedSupplierAdapter(supplier, feedUrl);
    }

    const websiteConfig = parseWebsiteConfig(env[`SUPPLIER_WEBSITE_CONFIG_${suffix}`]);
    return new WebsiteSupplierAdapter(supplier, {
      ...websiteConfig,
      username: env[`SUPPLIER_USERNAME_${suffix}`] ?? websiteConfig.username,
      password: env[`SUPPLIER_PASSWORD_${suffix}`] ?? websiteConfig.password,
    });
  });
}

function parseWebsiteConfig(value: string | undefined): WebsiteAdapterConfig {
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value) as WebsiteAdapterConfig;
  } catch (error) {
    throw new Error(`Invalid supplier website config JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function toEnvSuffix(id: string): string {
  return id.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

