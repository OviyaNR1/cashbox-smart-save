import { usePublicCurrency } from "@/lib/publicCurrency";

export default function CurrencySelector() {
  const { currency, setCurrency } = usePublicCurrency();
  return (
    <select
      value={currency}
      onChange={(e) => setCurrency(e.target.value)}
      className="h-8 px-3 rounded-full border border-border bg-card text-sm font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
    >
      <option value="all">All Currencies</option>
      <option value="INR">₹ INR</option>
      <option value="CAD">$ CAD</option>
    </select>
  );
}