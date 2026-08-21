import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { setCountryPref } from "@/lib/countryPref";

// Dedicated entry point per country — /in and /ca — so members get a
// distinct link for their market instead of a picker or a query param.
// Sets the preference, then sends them into sign-up already configured.
export default function CountryEntry({ country }) {
  useEffect(() => {
    setCountryPref(country);
  }, [country]);

  return <Navigate to="/register" replace />;
}
