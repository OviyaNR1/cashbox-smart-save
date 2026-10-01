import React, { useState } from "react";
import { X } from "lucide-react";

const DISMISS_KEY = "cashbox_wa_browser_tip_dismissed_v1";

// There is no code-level way to make a page evict itself from the app
// that's embedding it — WhatsApp (not the website) decides whether tapping
// a link opens its own built-in browser or hands off to the system one,
// and by the time this page's own JS runs, that decision has already been
// made. The only real escape is the user manually tapping WhatsApp's own
// "Open in browser" menu item, so the most useful thing this component can
// do is put that exact instruction in front of them immediately, wherever
// they land from a reminder link — not buried a few screens deep where
// someone stuck right after tapping the link would never see it.
//
// Shown unconditionally (not gated on detecting WhatsApp specifically,
// which has no reliable signal from here) and dismissible per-device via
// localStorage, so a returning visitor on a real browser doesn't keep
// seeing it.
export default function WhatsAppBrowserTip() {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  });

  if (dismissed) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* storage unavailable — just hides for this view */ }
    setDismissed(true);
  };

  return (
    <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
      <p className="flex-1 text-xs text-amber-400">
        Opened this from a WhatsApp message? For the full experience, tap <span className="font-semibold">⋮ (top-right) → Open in browser</span>.
      </p>
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="shrink-0 text-amber-400/70 hover:text-amber-400">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
