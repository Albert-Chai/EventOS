/** "MYR 12.50" from a numeric string, or "" when unpriced. */
export function formatPrice(price: string | null, currency: string): string {
  if (!price) return "";
  const n = Number(price);
  if (Number.isNaN(n)) return `${currency} ${price}`;
  return `${currency} ${n.toFixed(2)}`;
}
