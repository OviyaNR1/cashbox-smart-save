import { useEffect, useState } from "react";

// Counts up from when the auction actually started, like a phone call's
// recording timer — a constant, honest "this has been live for X" signal
// for the whole auction, distinct from useCountdown's per-call-stage
// countdown (which only runs during an active Call 1/2/Final window).
export function useElapsedTime(startedAt) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!startedAt) {
      setSeconds(0);
      return;
    }
    const startMs = new Date(startedAt).getTime();
    const tick = () => setSeconds(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n) => String(n).padStart(2, "0");
  const label = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;

  return label;
}
