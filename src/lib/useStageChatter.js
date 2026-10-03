import { useEffect, useRef } from "react";
import { speakAnnouncement } from "@/lib/tts";
import { announceStageChatter } from "@/lib/auctionAnnouncements";

// Auctioneer chatter at fixed points inside the longer call stages (seconds
// remaining -> which kind of line), so a 30s/20s stage with bids already in
// isn't just silence between the fixed call clips. Each point fires once per
// stage; the window check stops a stale line playing if the page is opened
// with a stage already well past that point.
//
// Timed to land AFTER the stage's own call line (~7s of clip + amount + clip)
// has finished, not on top of it: Call 1 line 30s-23s, chatter at 17s and 8s;
// Call 2 line 20s-13s, warning at 9s (~4s long), last push at 3s (~3s long) so
// it ends as the stage does.
const STAGE_CHATTER = {
  call_1: [{ at: 17, kind: "hold" }, { at: 8, kind: "hold" }],
  call_2: [{ at: 9, kind: "final-warning" }, { at: 3, kind: "last-seconds" }],
};

// Used by both the admin page and the member page: members join on phones
// and only hear what their own device plays, so the lines can't live on the
// admin screen alone.
export function useStageChatter(auction, countdown, currency) {
  const firedRef = useRef({ key: null, fired: new Set() });
  useEffect(() => {
    // India: one keep-going line per Call 1, not two. Every bid restarts Call
    // 1, so two per stage meant ~7 lines in a short auction from a small pool
    // and the same ones came back. Canada (more lines, and liked as is) keeps
    // both.
    let points = STAGE_CHATTER[auction?.status];
    if (auction?.status === "call_1" && currency !== "CAD") points = points?.slice(0, 1);
    if (countdown === null || !auction || !points) return;
    const stageKey = `${auction.id}:${auction.status}:${auction.call_stage_started_at}`;
    if (firedRef.current.key !== stageKey) firedRef.current = { key: stageKey, fired: new Set() };
    points.forEach(({ at, kind }) => {
      if (firedRef.current.fired.has(at) || countdown > at || countdown < at - 2) return;
      firedRef.current.fired.add(at);
      const line = announceStageChatter(kind, currency);
      if (line) speakAnnouncement(line.parts, { tag: "chatter", maxAgeMs: 3000 });
    });
  }, [countdown, auction?.id, auction?.status, auction?.call_stage_started_at]);
}
