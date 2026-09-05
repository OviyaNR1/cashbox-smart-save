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
import { amountToSpeechParts } from "./numberSpeech";

export function announceAuctionStart(startingAmount, currency) {
  return {
    parts: [
      { clip: "/audio/auction-start-a.mp3" },
      ...amountToSpeechParts(startingAmount, currency),
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
      ...amountToSpeechParts(amount, currency),
      { clip: "/audio/winner-congrats.mp3" },
    ],
    visual: `🏆 Winner: ${memberName} — ${formatMoney(amount, currency)}. Congrats!`,
  };
}

// A closing sign-off, spoken after the winner announcement — closes out
// the auction on a warm note instead of just going silent once the winner
// is named.
export function announceSignOff() {
  return {
    parts: [{ clip: "/audio/winner-signoff.mp3" }],
    visual: "👋 See you at next month's auction!",
  };
}

// A pool of short excited exclamations for a routine new (lower) bid —
// reused randomly instead of one fixed line every time, so the auction
// doesn't feel like it's replaying the same clip on every bid. This is the
// fallback once none of SPECIAL_REACTIONS below match.
const BID_REACTION_CLIPS = [
  "/audio/bid-reaction-1.mp3",
  "/audio/bid-reaction-2.mp3",
  "/audio/bid-reaction-3.mp3",
  "/audio/bid-reaction-4.mp3",
  "/audio/bid-reaction-5.mp3",
  "/audio/bid-reaction-6.mp3",
  "/audio/bid-reaction-7.mp3",
];

// Context-specific reactions, tried in this priority order before falling
// back to the generic pool — a real auctioneer reacts differently to two
// bids landing seconds apart than to a routine one, so a flat random pool
// alone can't carry that. Each is a single fixed clip (no specific number
// baked in, since e.g. the exact drop size is different every time) —
// splicing a live-spoken number between two clip halves was tried and
// sounded too choppy, so "big drop" stays qualitative; the actual new
// amount is still spoken right after via amountToSpeechParts below. `ctx`
// fields (all optional — a missing one just means that condition never
// matches):
//   amount            - the new bid's amount
//   dropSize          - previous lowest minus this amount (null if no prior bid)
//   previousBidAt / newBidAt - ISO timestamps, for the back-to-back check
//   countdownRemaining - seconds left in the current call stage, or null
//   minDecrement      - auction.min_decrement
//   minBid            - plan.auction_min_bid
//   startingAmount    - auction.starting_amount
const SPECIAL_REACTIONS = [
  {
    clips: ["/audio/reaction-back-to-back.mp3"],
    matches: (ctx) =>
      ctx.previousBidAt && ctx.newBidAt && new Date(ctx.newBidAt) - new Date(ctx.previousBidAt) < 5000,
  },
  {
    clips: ["/audio/reaction-last-second.mp3"],
    matches: (ctx) => ctx.countdownRemaining != null && ctx.countdownRemaining <= 5,
  },
  {
    clips: ["/audio/reaction-big-drop.mp3"],
    matches: (ctx) => ctx.dropSize != null && ctx.minDecrement > 0 && ctx.dropSize >= ctx.minDecrement * 3,
  },
  {
    // A cluster of small bids near the plan's floor triggers this on every
    // one of them — a single fixed clip would repeat verbatim back to back,
    // so this category gets a couple of variants like the generic pool does.
    clips: ["/audio/reaction-very-low.mp3", "/audio/reaction-very-low-2.mp3"],
    matches: (ctx) => ctx.minBid > 0 && ctx.amount - ctx.minBid <= (ctx.minDecrement || 0) * 2,
  },
  {
    // No historical per-group winning-bid data to compare against, so this
    // uses a fixed "typical" discount band off the starting amount instead
    // — chit auctions here tend to close in this range. Same repeat-risk as
    // very-low above, so it also gets a couple of variants.
    clips: ["/audio/reaction-close-range.mp3", "/audio/reaction-close-range-2.mp3", "/audio/reaction-close-range-3.mp3"],
    matches: (ctx) =>
      ctx.startingAmount > 0 && ctx.amount <= ctx.startingAmount * 0.88 && ctx.amount >= ctx.startingAmount * 0.78,
  },
];

export function announceNewLowestBid(amount, currency, context = {}) {
  const dropSize = context.previousAmount != null ? context.previousAmount - amount : null;
  const ctx = { ...context, amount, dropSize };
  const special = SPECIAL_REACTIONS.find((r) => r.matches(ctx));
  const pool = special ? special.clips : BID_REACTION_CLIPS;
  const reaction = pool[Math.floor(Math.random() * pool.length)];
  return {
    parts: [{ clip: reaction }, ...amountToSpeechParts(amount, currency)],
    visual: `📉 New lowest bid: ${formatMoney(amount, currency)}`,
  };
}

// Nudges the room when a call stage has gone quiet for a while with no new
// bid — a real auctioneer doesn't just silently wait out the clock.
// "first" fires at the stage's halfway point; "second" is a firmer escalation
// close to the end if it's still silent. Each fires at most once per stage.
export function announceSilence(tier = "first") {
  const clip = tier === "second" ? "/audio/silence-nudge-2.mp3" : "/audio/silence-nudge.mp3";
  return {
    parts: [{ clip }],
    visual: tier === "second" ? "🤫 Still no bids — come on, someone bid!" : "🤫 No bids yet — come on, someone bid!",
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
