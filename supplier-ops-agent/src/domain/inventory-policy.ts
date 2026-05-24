import type { StockStatus } from "./types.ts";

export type InventoryPolicyInput = {
  stockStatus: StockStatus;
  quantity?: number;
};

export type InventoryPolicyResult =
  | {
      shouldUpdate: true;
      quantity: number;
    }
  | {
      shouldUpdate: false;
      reason: string;
    };

export function resolveInventoryQuantity(input: InventoryPolicyInput): InventoryPolicyResult {
  if (input.stockStatus === "out_of_stock") {
    return { shouldUpdate: true, quantity: 0 };
  }

  if (input.stockStatus === "in_stock") {
    if (Number.isFinite(input.quantity) && input.quantity !== undefined) {
      return { shouldUpdate: true, quantity: Math.max(0, Math.floor(input.quantity)) };
    }

    return { shouldUpdate: true, quantity: 10 };
  }

  return { shouldUpdate: false, reason: "Supplier stock is unknown" };
}

