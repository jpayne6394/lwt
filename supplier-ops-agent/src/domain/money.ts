export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function moneyEqual(left: number | null | undefined, right: number | null | undefined): boolean {
  if (left == null && right == null) {
    return true;
  }

  if (left == null || right == null) {
    return false;
  }

  return roundMoney(left) === roundMoney(right);
}

