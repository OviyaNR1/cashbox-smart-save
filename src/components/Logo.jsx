import React from "react";

/**
 * CashBox wordmark — "Cash" in the theme's foreground color, "Box" in gold.
 */
export default function Logo({ className = "" }) {
  return (
    <span
      className={`text-2xl font-bold tracking-tight leading-none ${className}`}
      style={{ fontFamily: "'Montserrat', 'Segoe UI', system-ui, sans-serif" }}
    >
      <span className="text-foreground">Cash</span>
      <span style={{ color: "#ffb833" }}>Box</span>
    </span>
  );
}