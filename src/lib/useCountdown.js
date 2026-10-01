import { useEffect, useState } from "react";
import { playTick, playUrgentTick } from "@/lib/sound";

// A real fast-moving auction doesn't leave a full minute of silence between
// calls — bids come in back to back, and 60s/60s/30s read as the app
// stalling rather than an actual live auction. Short enough to keep the
// pace real, long enough that a member still has a real chance to see the
// call and counter-bid before it locks in.
export const CALL_DURATIONS = { call_1: 10, call_2: 10, final_call: 10 };

// Countdown for a live-auction call stage. Ticks audibly once per second and
// switches to an urgent tick for the last 5 seconds.
export function useCountdown(callStageStartedAt, status) {
  const duration = CALL_DURATIONS[status];
  const [remaining, setRemaining] = useState(null);

  useEffect(() => {
    if (!duration || !callStageStartedAt) {
      setRemaining(null);
      return;
    }
    const tick = (isFirst) => {
      const elapsed = (Date.now() - new Date(callStageStartedAt).getTime()) / 1000;
      const next = Math.max(0, Math.ceil(duration - elapsed));
      setRemaining(next);
      if (!isFirst && next > 0) {
        if (next <= 5) playUrgentTick();
        else playTick();
      }
    };
    tick(true);
    const id = setInterval(() => tick(false), 1000);
    return () => clearInterval(id);
  }, [callStageStartedAt, duration]);

  return remaining;
}
