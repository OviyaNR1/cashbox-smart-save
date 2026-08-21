/**
 * Multi-currency formatter.
 * Supports INR (₹) and CAD ($). Falls back to INR for legacy records.
 *
 * @param {number} n - amount
 * @param {string} currency - "INR" | "CAD"
 * @returns {string} formatted amount with symbol
 */
export function formatMoney(n, currency = "INR") {
  const num = Number(n || 0);
  if (currency === "CAD") {
    return `$${num.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `₹${num.toLocaleString("en-IN")}`;
}

export const CURRENCIES = [
  { code: "INR", symbol: "₹", label: "Indian Rupee" },
  { code: "CAD", symbol: "$", label: "Canadian Dollar" },
];