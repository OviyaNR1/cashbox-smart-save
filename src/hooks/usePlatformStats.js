import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { usePublicCurrency } from "@/lib/publicCurrency";

export function usePlatformStats() {
  const { currency } = usePublicCurrency();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    base44.functions
      .invoke("platformStats", { currency })
      .then((res) => setStats(res.data))
      .catch(() => setStats(null));
  }, [currency]);

  return stats;
}