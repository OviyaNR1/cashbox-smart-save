import React from "react";

export default function StatCard({ label, value, hint, icon: Icon, accent = "navy", onClick }) {
  const tones = {
    navy: "bg-primary/5 text-foreground",
    emerald: "bg-primary/10 text-primary",
    gold: "bg-primary/15 text-primary",
  };
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      onClick={onClick}
      className={`w-full text-left bg-card rounded-2xl border border-border p-5 transition-colors ${onClick ? "hover:border-primary/50 cursor-pointer" : "hover:border-primary/30"}`}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
        {Icon && (
          <span className={`w-9 h-9 rounded-xl grid place-items-center ${tones[accent]}`}>
            <Icon className="w-4 h-4" />
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-semibold text-foreground tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Wrapper>
  );
}