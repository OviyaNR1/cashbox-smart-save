import React, { createContext, useContext, useState, useEffect } from "react";

const PublicCurrencyContext = createContext();

export function PublicCurrencyProvider({ children }) {
  const [currency, setCurrency] = useState(() => {
    try {
      return localStorage.getItem("cashbox_currency") || "all";
    } catch {
      return "all";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("cashbox_currency", currency);
    } catch {
      // ignore
    }
  }, [currency]);

  return (
    <PublicCurrencyContext.Provider value={{ currency, setCurrency }}>
      {children}
    </PublicCurrencyContext.Provider>
  );
}

export function usePublicCurrency() {
  const ctx = useContext(PublicCurrencyContext);
  if (!ctx) {
    return { currency: "all", setCurrency: () => {} };
  }
  return ctx;
}