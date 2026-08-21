import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { getCountryPref, setCountryPref } from "@/lib/countryPref";

// India-only launch: the country picker is skipped for now (component kept
// at @/components/CountrySelection for when Canada goes live). ?country=CA
// lets a specific browser opt into testing the Canada flow without showing
// the picker to every real visitor still defaulting to India.
export default function Home() {
  const [role, setRole] = useState(undefined);

  useEffect(() => {
    base44.auth.me().then((u) => setRole(u.app_role)).catch(() => setRole("member"));
    if (!getCountryPref()) {
      const testCountry = new URLSearchParams(window.location.search).get("country");
      setCountryPref(testCountry === "CA" ? "CA" : "IN");
    }
  }, []);

  if (role === undefined) {
    return (
      <div className="fixed inset-0 grid place-items-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-[#2c3e50] rounded-full animate-spin" />
      </div>
    );
  }

  const staff = role === "admin" || role == null || ["super_admin", "branch_admin", "collection_agent"].includes(role);
  return <Navigate to={staff ? "/admin" : "/dashboard"} replace />;
}