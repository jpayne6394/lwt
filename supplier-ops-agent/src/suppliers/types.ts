import type { SupplierProduct } from "../domain/types.ts";
import type { SupplierCartPrepareCommand, SupplierCartPrepareReceipt } from "./cart-preparation.ts";

export type SupplierMode = "feed" | "website";

/** Closed diagnostic vocabulary: never substitute provider text or account data. */
export const SUPPLIER_AUTH_ISSUES = [
  "browser_launch_failed", "browser_context_failed", "supplier_page_unavailable",
  "existing_session_unverified", "login_form_unavailable", "credentials_rejected",
  "login_confirmation_missing", "challenge_required", "mfa_required",
  "renewed_session_unverified", "session_not_configured",
] as const;
export type SupplierAuthIssue = typeof SUPPLIER_AUTH_ISSUES[number];
export function isSupplierAuthIssue(value: unknown): value is SupplierAuthIssue {
  return typeof value === "string" && (SUPPLIER_AUTH_ISSUES as readonly string[]).includes(value);
}

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
  /** Reads one exact supplier SKU without expanding to a cart or order workflow. */
  lookupProduct?(supplierSku: string, context?: SupplierAdapterContext): Promise<SupplierProduct | null>;
  /**
   * Confirms that a portal accepts the stored account without opening products,
   * inventory, carts, or Shopify. Feed adapters intentionally omit this.
   */
  verifyLogin?(): Promise<SupplierConnectionCheck>;
  /** Proves an account-only marker, not merely a readable public catalog. */
  verifyAuthentication?(): Promise<SupplierConnectionCheck>;
  /** Prepares an exact supplier cart and shipping only. Never orders or pays. */
  prepareCart?(command: SupplierCartPrepareCommand): Promise<SupplierCartPrepareReceipt>;
};

export type SupplierConnectionCheck = {
  supplierId: string;
  supplierName: string;
  status:
    | "connected"
    | "verification_required"
    | "two_factor_required"
    | "login_failed"
    | "not_configured"
    | "unsupported";
  message: string;
  authIssue?: SupplierAuthIssue;
};

export class SupplierAdapterError extends Error {
  readonly supplierId: string;
  readonly kind:
    | "login_failed"
    | "verification_required"
    | "two_factor_required"
    | "parse_failed"
    | "not_configured";
  readonly authIssue?: SupplierAuthIssue;

  constructor(supplierId: string, kind: SupplierAdapterError["kind"], message: string, authIssue?: SupplierAuthIssue) {
    super(message);
    this.name = "SupplierAdapterError";
    this.supplierId = supplierId;
    this.kind = kind;
    this.authIssue = isSupplierAuthIssue(authIssue) ? authIssue : undefined;
  }
}

