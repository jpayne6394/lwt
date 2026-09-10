import type { SupplierProduct } from "../domain/types.ts";

export type SupplierMode = "feed" | "website";

export type SupplierConfig = {
  id: string;
  name: string;
  mode: SupplierMode;
  brands: string[];
  sourceEnvVar?: string;
  credentialEnvVar?: string;
  notes: string;
};

export type SupplierAdapterContext = {
  now?: Date;
  dryRun?: boolean;
};

export type SupplierAdapter = {
  supplier: SupplierConfig;
  fetchProducts(context?: SupplierAdapterContext): Promise<SupplierProduct[]>;
  /**
   * Confirms that a portal accepts the stored account without opening products,
   * inventory, carts, or Shopify. Feed adapters intentionally omit this.
   */
  verifyLogin?(): Promise<SupplierConnectionCheck>;
};

export type SupplierConnectionCheck = {
  supplierId: string;
  supplierName: string;
  status: "connected" | "two_factor_required" | "login_failed" | "not_configured" | "unsupported";
  message: string;
};

export class SupplierAdapterError extends Error {
  readonly supplierId: string;
  readonly kind: "login_failed" | "two_factor_required" | "parse_failed" | "not_configured";

  constructor(supplierId: string, kind: SupplierAdapterError["kind"], message: string) {
    super(message);
    this.name = "SupplierAdapterError";
    this.supplierId = supplierId;
    this.kind = kind;
  }
}

