// Reusable auction-announcement script. Fixed phrases (call terms, warnings,
// open/close, "Congratulations!") are real recorded clips (public/audio/*)
// — a live browser TTS voice reading the same fixed line every time is
// exactly what sounds robotic; a real recorded clip doesn't. Only the parts
// that actually change from event to event (the amount, the winner's name)
// are spoken live via speakSmart, sandwiched between clips.
//
// Each builder returns { parts, visual } — `parts` for speakAnnouncement
// (see @/lib/tts), and a short `visual` label. Every announcement must be
// readable on-screen too, since a member with sound off must get the same
// information (accessibility — never rely on sound alone).

export function announceAuctionStart() {
  return {
    parts: [{ clip: "/audio/auction-start.wav" }],
    visual: "🔔 Auction started",
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
    parts: [{ clip: "/audio/auction-closed.wav" }],
    visual: "🏁 Auction closed! Let's see the winner...",
  };
}

// Only the member's approved display name and the winning amount are ever
// spoken/shown — no other personal detail passes through this function.
export function announceWinner(memberName, amountLabel) {
  return {
    parts: [
      { clip: "/audio/winner-prefix.wav" },
      { text: memberName },
      { text: `Winning bid: ${amountLabel}.` },
      { clip: "/audio/winner-congrats.wav" },
    ],
    visual: `🏆 Winner: ${memberName} — ${amountLabel}. Congrats!`,
  };
}

export function announceNewLowestBid(amountLabel) {
  return {
    parts: [{ text: `New lowest bid, everyone: ${amountLabel}!` }],
    visual: `📉 New lowest bid: ${amountLabel}`,
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
