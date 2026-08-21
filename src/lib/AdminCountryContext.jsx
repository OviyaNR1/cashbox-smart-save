import React, { createContext, useContext, useState, useEffect } from "react";

// Separate from countryPref.js on purpose — that one decides which country a
// MEMBER is signing up into (set once via /in or /ca). This one is the
// ADMIN's own choice of which market's data to look at right now, shared
// across every admin page via the header dropdown so it doesn't reset to
// India every time they navigate — only changes when they change it.
const STORAGE_KEY = "cashbox_admin_country_view";
const AdminCountryContext = createContext(null);

export function AdminCountryProvider({ children }) {
  const [country, setCountry] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || "India";
    } catch {
      return "India";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, country);
    } catch {
      // ignore
    }
  }, [country]);

  return (
    <AdminCountryContext.Provider value={{ country, setCountry }}>
      {children}
    </AdminCountryContext.Provider>
  );
}

export function useAdminCountry() {
  const ctx = useContext(AdminCountryContext);
  if (!ctx) throw new Error("useAdminCountry must be used within AdminCountryProvider");
  return ctx;
}
