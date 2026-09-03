import React, { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { isSoundEnabled, setSoundEnabled } from "@/lib/soundPrefs";
import { primeAudio } from "@/lib/sound";

// Sound is OFF by default on first visit (browsers block autoplay anyway,
// and not everyone wants auction sound effects) — this is the only way to
// turn it on, and the choice is remembered per-browser via localStorage.
export default function SoundToggle({ className = "" }) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(isSoundEnabled());
  }, []);

  const toggle = () => {
    const next = !enabled;
    // Flipping this ON is itself the real user gesture browsers require
    // before any audio/speech will actually play — prime right here.
    if (next) primeAudio();
    setSoundEnabled(next);
    setEnabled(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={enabled}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
        enabled
          ? "bg-primary/10 border-primary/30 text-primary"
          : "bg-muted border-border text-muted-foreground"
      } ${className}`}
    >
      {enabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
      {enabled ? "Sound ON" : "Sound OFF"}
    </button>
  );
}
