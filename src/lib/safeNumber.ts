/**
 * Safely convert any value to a finite number.
 * Returns fallback if the value is not a valid finite number.
 */
export function safeNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return fallback;
    const n = Number(trimmed);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/**
 * Format a value as a string with fixed decimal places.
 * Safely handles non-numeric values by returning a fallback string.
 */
export function safeToFixed(
  value: unknown,
  decimals = 2,
  fallback = "--"
): string {
  const num = safeNumber(value, NaN);
  if (!Number.isFinite(num)) return fallback;
  return num.toFixed(decimals);
}
