import { useEffect, useState } from "react";
import { playTick, playUrgentTick } from "@/lib/sound";

// Pace of a real live auction: a relaxed first call, a tighter second, then
// a short final call. 60s/60s/30s read as the app stalling.
export const CALL_DURATIONS = { call_1: 30, call_2: 20, final_call: 10 };

// Countdown for a live-auction call stage. Ticks audibly once per second and
// switches to an urgent tick for the last 5 seconds.
export function useCountdown(callStageStartedAt, status) {
  const duration = CALL_DURATIONS[status];
  // The value is stored with the stage it was computed for. When a stage
  // changes, `remaining` from the PREVIOUS stage (0, if it just expired)
  // used to be returned for one render before the effect below recomputed
  // it — long enough for the auto-advance logic to read "time's up" for the
  // brand-new stage and skip straight past it (Call 2 lasted ~0.1s and its
  // clip was cut off mid-word). A value from another stage is never returned.
  const stageKey = duration && callStageStartedAt ? `${status}|${callStageStartedAt}` : null;
  const [state, setState] = useState({ key: null, remaining: null });

  useEffect(() => {
    if (!stageKey) {
      setState({ key: null, remaining: null });
      return;
    }
    const tick = (isFirst) => {
      const elapsed = (Date.now() - new Date(callStageStartedAt).getTime()) / 1000;
      const next = Math.max(0, Math.ceil(duration - elapsed));
      setState({ key: stageKey, remaining: next });
      if (!isFirst && next > 0) {
        if (next <= 5) playUrgentTick();
        else playTick();
      }
    };
    tick(true);
    const id = setInterval(() => tick(false), 1000);
    return () => clearInterval(id);
  }, [stageKey, callStageStartedAt, duration]);

  return stageKey && state.key === stageKey ? state.remaining : null;
}
