// Reusable auction-announcement script — casual, conversational Tamil mixed
// naturally with English (the way a real person hosts an auction in a
// WhatsApp group), not formal/literary Tamil. Each builder returns both the
// spoken text (for speakSmart, see @/lib/tts) and a short visual label —
// every announcement must be readable on-screen too, since a member with
// sound off must get the same information (accessibility — never rely on
// sound alone).

export function announceAuctionStart(groupLabel) {
  return {
    spoken:
      `Okay guys, ${groupLabel ? groupLabel + " " : ""}auction start ஆகுது! Everyone ready ah? ` +
      `உங்க bid amount போட்டு submit பண்ணுங்க. Remember guys... lowest bid தான் win பண்ணும்!`,
    visual: "🔔 Auction start ஆகுது — Auction started",
  };
}

export function announceOneMinuteWarning() {
  return {
    spoken: "Guys, இன்னும் one minute தான் இருக்கு! உங்க bid check பண்ணிக்கோங்க. இன்னும் chance இருக்கு... lowest bid தான் win பண்ணும்!",
    visual: "⏰ One minute தான் இருக்கு — 1 minute left",
  };
}

export function announceThirtySeconds() {
  return {
    spoken: "Guys, last 30 seconds!",
    visual: "⚠️ Last 30 seconds guys!",
  };
}

export function announceTenSeconds() {
  return {
    spoken: "Okay... 10 seconds guys!",
    visual: "🔥 10 seconds guys!",
  };
}

// Casual code-switched countdown counts in English, the way it's actually
// spoken out loud in this context — not formal Tamil numerals.
const COUNTDOWN_WORDS = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

// n from 10 down to 1.
export function announceCountdownDigit(n) {
  const word = COUNTDOWN_WORDS[n];
  if (!word) return null;
  return { spoken: `${word}...`, visual: String(n) };
}

export function announceAuctionClosed() {
  return {
    spoken: "Okay guys, auction closed! Let's see who is the winner...",
    visual: "🏁 Auction closed! Let's see the winner...",
  };
}

// Only the member's approved display name and the winning amount are ever
// spoken/shown — no other personal detail passes through this function.
export function announceWinner(memberName, amountLabel) {
  return {
    spoken: `இந்த month winner... ${memberName}! Winning amount ${amountLabel}. Congrats ${memberName}!`,
    visual: `🏆 Winner: ${memberName} — ${amountLabel}. Congrats!`,
  };
}

export function announceNewLowestBid(amountLabel) {
  return {
    spoken: `New lowest bid guys, ${amountLabel}!`,
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
