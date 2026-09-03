// Reusable auction-announcement script. Fixed phrases (call terms, warnings,
// open/close, "Congratulations!") are real recorded clips (public/audio/*)
// — a live browser TTS voice reading the same fixed line every time is
// exactly what sounds robotic; a real recorded clip doesn't. Amounts change
// every bid and can't be pre-recorded whole, but they're still built from
// real recorded number-tile clips (see @/lib/numberSpeech) rather than
// falling back to a live robotic voice — only a name (which can't be
// tiled) is ever spoken live.
//
// Each builder returns { parts, visual } — `parts` for speakAnnouncement
// (see @/lib/tts), and a short `visual` label. Every announcement must be
// readable on-screen too, since a member with sound off must get the same
// information (accessibility — never rely on sound alone).

import { formatMoney } from "@/lib/currency";
import { amountToClipParts } from "./numberSpeech";

export function announceAuctionStart(startingAmount, currency) {
  return {
    parts: [
      { clip: "/audio/auction-start-a.mp3" },
      ...amountToClipParts(startingAmount, currency),
      { clip: "/audio/auction-start-b.mp3" },
    ],
    visual: `🔔 Auction started — starting bid ${formatMoney(startingAmount, currency)}`,
  };
}

export function announceOneMinuteWarning() {
  return {
    parts: [{ clip: "/audio/warn-1min.wav" }],
    visual: "⏰ One minute left",
  };
}

export function announceThirtySeconds() {
  return {
    parts: [{ clip: "/audio/warn-30s.wav" }],
    visual: "⚠️ Last 30 seconds!",
  };
}

export function announceTenSeconds() {
  return {
    parts: [{ clip: "/audio/warn-10s.wav" }],
    visual: "🔥 10 seconds left!",
  };
}

const DIGIT_CLIPS = {
  10: "/audio/digit-10.wav",
  9: "/audio/digit-9.wav",
  8: "/audio/digit-8.wav",
  7: "/audio/digit-7.wav",
  6: "/audio/digit-6.wav",
  5: "/audio/digit-5.wav",
  4: "/audio/digit-4.wav",
  3: "/audio/digit-3.wav",
  2: "/audio/digit-2.wav",
  1: "/audio/digit-1.wav",
};

// n from 10 down to 1.
export function announceCountdownDigit(n) {
  const clip = DIGIT_CLIPS[n];
  if (!clip) return null;
  return { parts: [{ clip }], visual: String(n) };
}

export function announceAuctionClosed() {
  return {
    parts: [{ clip: "/audio/auction-closed.mp3" }],
    visual: "🏁 Auction closed! Let's see the winner...",
  };
}

// Only the member's approved display name and the winning amount are ever
// spoken/shown — no other personal detail passes through this function.
// The name can't be pre-recorded (it's different every month), so it's the
// one part still spoken live, sandwiched between the real recorded clips.
export function announceWinner(memberName, amount, currency) {
  return {
    parts: [
      { clip: "/audio/winner-prefix.mp3" },
      { text: memberName },
      ...amountToClipParts(amount, currency),
      { clip: "/audio/winner-congrats.mp3" },
    ],
    visual: `🏆 Winner: ${memberName} — ${formatMoney(amount, currency)}. Congrats!`,
  };
}

export function announceNewLowestBid(amount, currency) {
  return {
    parts: amountToClipParts(amount, currency),
    visual: `📉 New lowest bid: ${formatMoney(amount, currency)}`,
  };
}

// Keeps one member's repeated bidding from spamming voice announcements —
// at most one spoken "new lowest bid" call per window, shared across the
// whole auction room (module-level, not per-component) since the throttle
// is about how often anyone hears a voice line, not who triggered it.
let lastBidAnnounceAt = 0;
const BID_ANNOUNCE_THROTTLE_MS = 4000;

export function shouldAnnounceBid() {
  const now = Date.now();
  if (now - lastBidAnnounceAt < BID_ANNOUNCE_THROTTLE_MS) return false;
  lastBidAnnounceAt = now;
  return true;
}
