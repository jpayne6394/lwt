import { roundMoney } from "./money.ts";

const PRICE_SWING_GUARDRAIL = 0.25;

export type PricingPolicyInput = {
  currentPrice: number;
  supplierCost?: number;
  supplierMsrp?: number;
  supplierSalePrice?: number;
};

export type PricingPolicyResult =
  | {
      shouldUpdate: true;
      price: number;
      compareAtPrice: number | null;
      reason: string;
    }
  | {
      shouldUpdate: false;
      reason: string;
      blockedPrice?: number;
      currentPrice?: number;
    };

export function resolveRegularPrice(input: Pick<PricingPolicyInput, "supplierCost" | "supplierMsrp">): {
  price: number | null;
  reason: string;
} {
  if (isPositiveMoney(input.supplierMsrp)) {
    return {
      price: roundMoney(input.supplierMsrp),
      reason: "Using supplier MSRP/list price",
    };
  }

  if (isPositiveMoney(input.supplierCost)) {
    return {
      price: roundMoney(input.supplierCost * 2),
      reason: "Using 2x cost fallback",
    };
  }

  return {
    price: null,
    reason: "No supplier price data",
  };
}

export function planPriceUpdate(input: PricingPolicyInput): PricingPolicyResult {
  const regular = resolveRegularPrice(input);

  if (regular.price == null) {
    return { shouldUpdate: false, reason: regular.reason };
  }

  let targetPrice = regular.price;
  let compareAtPrice: number | null = null;
  let reason = regular.reason;

  if (isPositiveMoney(input.supplierSalePrice) && input.supplierSalePrice < regular.price) {
    targetPrice = roundMoney(input.supplierSalePrice);
    compareAtPrice = regular.price;
    reason = "Mirroring supplier sale price";
  }

  if (exceedsPriceGuardrail(input.currentPrice, targetPrice)) {
    return {
      shouldUpdate: false,
      reason: "Price change exceeds 25% guardrail",
      blockedPrice: targetPrice,
      currentPrice: input.currentPrice,
    };
  }

  return {
    shouldUpdate: true,
    price: targetPrice,
    compareAtPrice,
    reason,
  };
}

function exceedsPriceGuardrail(currentPrice: number, nextPrice: number): boolean {
  if (!isPositiveMoney(currentPrice)) {
    return false;
  }

  return Math.abs(nextPrice - currentPrice) / currentPrice > PRICE_SWING_GUARDRAIL;
}

function isPositiveMoney(value: number | undefined): value is number {
  return Number.isFinite(value) && value !== undefined && value > 0;
}

