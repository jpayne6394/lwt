/** Build-only wire contract. No caller URLs, scripts, checkout, or payment authority. */
export const CART_PREPARE_REASONS = ["auth_required", "verification_required", "two_factor_required", "unsupported_supplier",
  "item_not_found", "variant_mismatch", "quantity_unavailable", "shipping_unavailable", "shipping_mismatch", "cart_not_verified",
  "unexpected_existing_cart", "worker_unavailable", "outcome_unknown", "connection_changed", "source_changed"] as const;
export type SupplierCartPrepareReason = typeof CART_PREPARE_REASONS[number];
export interface SupplierCartPrepareCommand {
  protocolVersion: "supplier_cart_prepare_v1"; commandId: string; draftId: string; fingerprint: string; supplierKey: string;
  items: Array<{ supplierSku: string; quantity: number; packageHint: string }>;
  shipping: { name: string; firstName: string; lastName: string; company: string; address1: string; address2: string;
    city: string; province: string; postalCode: string; country: string };
}
export interface SupplierCartPrepareReceipt {
  protocolVersion: "supplier_cart_prepare_v1"; commandId: string; draftId: string; fingerprint: string; supplierKey: string;
  status: "prepared" | "blocked" | "unknown"; reason?: SupplierCartPrepareReason; verifiedAt: string;
  items: Array<{ supplierSku: string; quantity: number }>;
  shippingApplied: boolean; shippingMatches: boolean; remoteCartRef?: string; orderSubmitted: false; paymentSubmitted: false;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SKU = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/;
const row = (v: unknown): Record<string, unknown> | null => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const keys = (v: Record<string, unknown>, expected: string[]) => Object.keys(v).length === expected.length && expected.every(k => Object.hasOwn(v, k));
const text = (v: unknown, max: number, required = false): v is string => typeof v === "string" && v.length <= max
  && !/[\u0000-\u001f\u007f]/.test(v) && (!required || v.trim().length > 0);

export function parseSupplierCartPrepareCommand(value: unknown): SupplierCartPrepareCommand | null {
  const r = row(value), s = row(r?.shipping);
  if (!r || !keys(r, ["protocolVersion", "commandId", "draftId", "fingerprint", "supplierKey", "items", "shipping"])
    || r.protocolVersion !== "supplier_cart_prepare_v1" || typeof r.commandId !== "string" || !UUID.test(r.commandId)
    || typeof r.draftId !== "string" || !UUID.test(r.draftId) || typeof r.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(r.fingerprint)
    || typeof r.supplierKey !== "string" || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(r.supplierKey)
    || !Array.isArray(r.items) || !r.items.length || r.items.length > 50 || !s
    || !keys(s, ["name", "firstName", "lastName", "company", "address1", "address2", "city", "province", "postalCode", "country"])) return null;
  for (const k of ["name", "firstName", "lastName", "address1", "city", "province", "postalCode", "country"]) if (!text(s[k], 200, true)) return null;
  if (!text(s.company, 200) || !text(s.address2, 200)) return null;
  const seen = new Set<string>();
  for (const candidate of r.items) {
    const item = row(candidate);
    if (!item || !keys(item, ["supplierSku", "quantity", "packageHint"]) || typeof item.supplierSku !== "string" || !SKU.test(item.supplierSku)
      || seen.has(item.supplierSku) || !Number.isSafeInteger(item.quantity) || Number(item.quantity) < 1 || Number(item.quantity) > 10000
      || !text(item.packageHint, 100)) return null;
    seen.add(item.supplierSku);
  }
  return r as unknown as SupplierCartPrepareCommand;
}

export function cartPrepareReceipt(command: SupplierCartPrepareCommand, status: "blocked" | "unknown", reason: SupplierCartPrepareReason): SupplierCartPrepareReceipt {
  return { protocolVersion: "supplier_cart_prepare_v1", commandId: command.commandId, draftId: command.draftId,
    fingerprint: command.fingerprint, supplierKey: command.supplierKey, status, reason, verifiedAt: new Date().toISOString(),
    items: [], shippingApplied: false, shippingMatches: false, orderSubmitted: false, paymentSubmitted: false };
}

/** Always project adapter output; never emit provider errors, credentials, or addresses. */
export function safeCartPrepareReceipt(value: unknown, command: SupplierCartPrepareCommand): SupplierCartPrepareReceipt {
  const r = row(value);
  const unknown = () => cartPrepareReceipt(command, "unknown", "cart_not_verified");
  if (!r || r.protocolVersion !== command.protocolVersion || r.commandId !== command.commandId || r.draftId !== command.draftId
    || r.fingerprint !== command.fingerprint || r.supplierKey !== command.supplierKey || !["prepared", "blocked", "unknown"].includes(String(r.status))
    || r.orderSubmitted !== false || r.paymentSubmitted !== false || typeof r.shippingApplied !== "boolean" || typeof r.shippingMatches !== "boolean"
    || typeof r.verifiedAt !== "string" || !Number.isFinite(Date.parse(r.verifiedAt)) || !Array.isArray(r.items) || r.items.length > 50
    || (r.reason !== undefined && !(CART_PREPARE_REASONS as readonly unknown[]).includes(r.reason))) return unknown();
  const items: SupplierCartPrepareReceipt["items"] = [], seen = new Set<string>();
  for (const v of r.items) {
    const i = row(v);
    if (!i || typeof i.supplierSku !== "string" || !SKU.test(i.supplierSku) || seen.has(i.supplierSku)
      || !Number.isSafeInteger(i.quantity) || Number(i.quantity) < 1 || !command.items.some(w => w.supplierSku === i.supplierSku && Number(i.quantity) <= w.quantity)) return unknown();
    seen.add(i.supplierSku); items.push({ supplierSku: i.supplierSku, quantity: Number(i.quantity) });
  }
  if (r.status === "prepared" && (!r.shippingApplied || !r.shippingMatches || items.length !== command.items.length
    || !command.items.every(w => items.some(i => i.supplierSku === w.supplierSku && i.quantity === w.quantity)))) return unknown();
  if (r.status !== "prepared" && r.reason === undefined) return unknown();
  return { protocolVersion: command.protocolVersion, commandId: command.commandId, draftId: command.draftId, fingerprint: command.fingerprint,
    supplierKey: command.supplierKey, status: r.status as SupplierCartPrepareReceipt["status"], verifiedAt: new Date(r.verifiedAt).toISOString(),
    ...(r.reason === undefined ? {} : { reason: r.reason as SupplierCartPrepareReason }), items,
    shippingApplied: r.shippingApplied, shippingMatches: r.shippingMatches,
    ...(typeof r.remoteCartRef === "string" && /^[A-Za-z0-9._:-]{1,160}$/.test(r.remoteCartRef) ? { remoteCartRef: r.remoteCartRef } : {}),
    orderSubmitted: false, paymentSubmitted: false };
}
