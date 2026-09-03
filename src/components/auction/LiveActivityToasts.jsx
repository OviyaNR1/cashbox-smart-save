import React from "react";
import { UserPlus, TrendingDown } from "lucide-react";

const TONE_STYLES = {
  join: "bg-primary/15 border-primary/30 text-foreground",
  bid: "bg-emerald-500/15 border-emerald-500/30 text-foreground",
  default: "bg-card border-border text-foreground",
};

const TONE_ICON = {
  join: UserPlus,
  bid: TrendingDown,
};

// Fixed to the top of the viewport, stacking downward — sits above
// everything else on the page so a burst of activity is impossible to miss,
// same instinct as a live-stream's follow/donation alerts.
export default function LiveActivityToasts({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[70] flex flex-col items-center gap-2 pointer-events-none w-full px-4">
      {toasts.map((t) => {
        const Icon = TONE_ICON[t.tone];
        return (
          <div
            key={t.id}
            // rounded-full reads fine for short text but wraps ugly (or
            // overflows) once a real name pushes it past ~2-3 words on a
            // narrow phone screen — capped width + rounded-2xl instead of
            // -full lets it wrap cleanly to a second line if it has to.
            className={`flex items-center gap-2 px-4 py-2 max-w-[92vw] sm:max-w-sm rounded-2xl border shadow-lg text-sm font-medium text-center animate-in slide-in-from-top-4 fade-in duration-300 ${TONE_STYLES[t.tone] || TONE_STYLES.default}`}
          >
            {Icon && <Icon className="w-4 h-4 shrink-0" />}
            {t.message}
          </div>
        );
      })}
    </div>
  );
}
