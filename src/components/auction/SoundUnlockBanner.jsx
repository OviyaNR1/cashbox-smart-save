import React, { useEffect, useState } from "react";
import { isAudioUnlocked, primeAudio } from "@/lib/sound";

// Browsers refuse to play any sound — ticks, beeps, the AI voice — until the
// person has tapped the page at least once. An admin presses buttons all the
// time so it just works for them, but a member who only watches the room never
// taps anything and silently hears nothing. This shows a one-tap prompt until
// sound is actually unlocked, then removes itself.
export default function SoundUnlockBanner() {
  const [ready, setReady] = useState(() => isAudioUnlocked());

  useEffect(() => {
    if (ready) return undefined;
    const check = () => setReady(isAudioUnlocked());
    const onTap = () => {
      primeAudio();
      setTimeout(check, 150);
    };
    const id = setInterval(check, 1000);
    document.addEventListener("pointerdown", onTap);
    return () => {
      clearInterval(id);
      document.removeEventListener("pointerdown", onTap);
    };
  }, [ready]);

  if (ready) return null;
  return (
    <button
      type="button"
      onClick={() => { primeAudio(); setReady(isAudioUnlocked()); }}
      className="w-full rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-300 text-sm font-medium py-3 px-4"
    >
      🔊 Tap here to turn on the auction sound
    </button>
  );
}
