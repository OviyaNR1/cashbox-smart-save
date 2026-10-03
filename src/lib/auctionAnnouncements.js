// Reusable auction-announcement script. Fixed phrases (call terms, warnings,
// open/close, "Congratulations!") are real recorded clips (public/audio/*)
// — a live browser TTS voice reading the same fixed line every time is
// exactly what sounds robotic; a real recorded clip doesn't. Amounts change
// every bid and can't be pre-recorded whole, but they're still built from
// real recorded number-tile clips (see @/lib/numberSpeech) rather than
// falling back to a live robotic voice — only a name (which can't be
// tiled) is ever spoken live.
//
// India's recorded clips (public/audio/*) are all Tamil, spoken by the same
// auctioneer character — Higgsfield/ElevenLabs preset voice "Dylan"
// (voice_id b847bc29-f184-583a-8ad9-d1f1e16d1a60), confirmed from the
// actual generation history. Canada explicitly must never hear
// Tamil/Malayalam, but should still hear that same character — so every
// English line here (public/audio/en/*) was generated with that identical
// voice/model, just speaking English text instead of Tamil. Every builder
// below branches on `currency === "CAD"` and picks the matching English
// clip instead of the Tamil one; India's path (and its files) is untouched
// either way.
//
// Each builder returns { parts, visual } — `parts` for speakAnnouncement
// (see @/lib/tts), and a short `visual` label. Every announcement must be
// readable on-screen too, since a member with sound off must get the same
// information (accessibility — never rely on sound alone).

import { formatMoney } from "@/lib/currency";
import { amountToSpeechParts } from "./numberSpeech";
import { CA_VOICE_V2, V2, nameClip } from "./caVoice";

const isCAD = (currency) => currency === "CAD";

// Canada's livelier auctioneer (opening, bidder names, new keep-going lines,
// "going twice", winner line). Everything new lives in public/audio/en/v2 and
// is only reached through this flag, so setting it to false puts the previous
// English voice back exactly as it was. India never reads it.
export { CA_VOICE_V2 };
// A recorded Dylan clip for a known first name, else the live-spoken name.
const namePart = (name) => {
  const clip = nameClip(name);
  return clip ? { clip } : { text: name };
};
const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function announceAuctionStart(startingAmount, currency) {
  const v2 = isCAD(currency) && CA_VOICE_V2 ? pickOne(["1", "2"]) : null;
  const parts = v2
    ? [
        { clip: `${V2}/open-${v2}-a.mp3` },
        ...amountToSpeechParts(startingAmount, currency),
        { clip: `${V2}/open-${v2}-b.mp3` },
      ]
    : isCAD(currency)
    ? [
        { clip: "/audio/en/auction-start-a.mp3" },
        ...amountToSpeechParts(startingAmount, currency),
        { clip: "/audio/en/auction-start-b.mp3" },
      ]
    : [
        { clip: "/audio/auction-start-a.mp3" },
        ...amountToSpeechParts(startingAmount, currency),
        { clip: "/audio/auction-start-b.mp3" },
      ];
  return {
    parts,
    visual: `🔔 Auction started — starting bid ${formatMoney(startingAmount, currency)}`,
  };
}

// No English clips exist for these three — they're dead code (nothing in
// the app currently calls them, see AdminLiveAuction.jsx/LiveAuction.jsx),
// so there was nothing to record. If they ever get wired in, they'll need
// public/audio/en/warn-*.mp3 recorded the same way as everything else here.
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

// n from 10 down to 1. Also unused today — see the warning functions above.
export function announceCountdownDigit(n) {
  const clip = DIGIT_CLIPS[n];
  if (!clip) return null;
  return { parts: [{ clip }], visual: String(n) };
}

export function announceAuctionClosed(currency) {
  return {
    parts: [{ clip: isCAD(currency) ? "/audio/en/auction-closed.mp3" : "/audio/auction-closed.mp3" }],
    visual: "🏁 Auction closed! Let's see the winner...",
  };
}

// Only the member's approved display name and the winning amount are ever
// spoken/shown — no other personal detail passes through this function.
// The name can't be pre-recorded (it's different every month), so it's the
// one part still spoken live, sandwiched between the real recorded clips.
export function announceWinner(memberName, amount, currency) {
  const cad = isCAD(currency);
  if (cad && CA_VOICE_V2) {
    const you = memberName === "You";
    return {
      parts: you
        ? [{ clip: `${V2}/win-you.mp3` }, ...amountToSpeechParts(amount, currency)]
        : [{ clip: `${V2}/win-a.mp3` }, namePart(spokenName(memberName)), { clip: `${V2}/win-b.mp3` }, ...amountToSpeechParts(amount, currency)],
      visual: `🏆 Winner: ${memberName} — ${formatMoney(amount, currency)}. Congrats!`,
    };
  }
  const parts = [
    { clip: cad ? "/audio/en/winner-prefix.mp3" : "/audio/winner-prefix.mp3" },
    { text: memberName },
    ...amountToSpeechParts(amount, currency),
    { clip: cad ? "/audio/en/winner-congrats.mp3" : "/audio/winner-congrats.mp3" },
  ];
  return {
    parts,
    visual: `🏆 Winner: ${memberName} — ${formatMoney(amount, currency)}. Congrats!`,
  };
}

// A closing sign-off, spoken after the winner announcement — closes out
// the auction on a warm note instead of just going silent once the winner
// is named.
export function announceSignOff(currency) {
  return {
    parts: [{ clip: isCAD(currency) ? "/audio/en/winner-signoff.mp3" : "/audio/winner-signoff.mp3" }],
    visual: "👋 See you at next month's auction!",
  };
}

// A pool of short excited exclamations for a routine new (lower) bid —
// reused randomly instead of one fixed line every time, so the auction
// doesn't feel like it's replaying the same clip on every bid. This is the
// fallback once none of SPECIAL_REACTIONS below match. The English pool
// mirrors it 1:1 (same size, same character) so "variety, not repetition"
// carries over identically for Canada.
// Generic Tamil bid reactions. Two clips were taken out because the room asked
// for them to go (transcribed to check): bid-reaction-2 ("Oh ho, innum kammi
// vandhuchu") and bid-reaction-5 ("Aamaam, kammi bid vandhuchu"). The files
// stay in public/audio. Kept: 1, 3, 4, 6, 7.
const BID_REACTION_CLIPS = [1, 3, 4, 6, 7].map((n) => `/audio/bid-reaction-${n}.mp3`);
const BID_REACTION_CLIPS_EN = [
  "/audio/en/bid-reaction-1.mp3",
  "/audio/en/bid-reaction-2.mp3",
  "/audio/en/bid-reaction-3.mp3",
  "/audio/en/bid-reaction-4.mp3",
  "/audio/en/bid-reaction-5.mp3",
  "/audio/en/bid-reaction-6.mp3",
  "/audio/en/bid-reaction-7.mp3",
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
    // The very first bid of an auction. The generic pool has "innum kammi…"
    // ("an even lower one") lines that only make sense after an earlier bid.
    // India only for now — Canada's pool has no such lines.
    clips: ["/audio/reaction-first-bid.mp3"],
    clipsEn: [],
    matches: (ctx) => ctx.isFirstBid && !ctx.isCad,
  },
  {
    clips: ["/audio/reaction-back-to-back.mp3"],
    clipsEn: ["/audio/en/reaction-back-to-back.mp3"],
    matches: (ctx) =>
      ctx.previousBidAt && ctx.newBidAt && new Date(ctx.newBidAt) - new Date(ctx.previousBidAt) < 5000,
  },
  {
    clips: ["/audio/reaction-last-second.mp3"],
    clipsEn: ["/audio/en/reaction-last-second.mp3"],
    matches: (ctx) => ctx.countdownRemaining != null && ctx.countdownRemaining <= 5,
  },
  {
    clips: ["/audio/reaction-big-drop.mp3"],
    clipsEn: ["/audio/en/reaction-big-drop.mp3"],
    // ₹ plans drop in multiples of a 500 step, so a 3x drop is just a normal
    // bid there and "big drop" played on nearly every one; it needs to be a
    // genuinely large jump (5x) to count as one. Canada keeps 3x.
    matches: (ctx) => ctx.dropSize != null && ctx.minDecrement > 0 && ctx.dropSize >= ctx.minDecrement * (ctx.isCad ? 3 : 5),
  },
  {
    // A cluster of small bids near the plan's floor triggers this on every
    // one of them — a single fixed clip would repeat verbatim back to back,
    // so this category gets a couple of variants like the generic pool does.
    clips: ["/audio/reaction-very-low.mp3", "/audio/reaction-very-low-2.mp3"],
    clipsEn: ["/audio/en/reaction-very-low.mp3", "/audio/en/reaction-very-low-2.mp3"],
    matches: (ctx) => ctx.minBid > 0 && ctx.amount - ctx.minBid <= (ctx.minDecrement || 0) * 2,
  },
  {
    // No historical per-group winning-bid data to compare against, so this
    // uses a fixed "typical" discount band off the starting amount instead
    // — chit auctions here tend to close in this range. Same repeat-risk as
    // very-low above, so it also gets a couple of variants.
    clips: ["/audio/reaction-close-range.mp3", "/audio/reaction-close-range-2.mp3", "/audio/reaction-close-range-3.mp3"],
    clipsEn: ["/audio/en/reaction-close-range.mp3", "/audio/en/reaction-close-range-2.mp3", "/audio/en/reaction-close-range-3.mp3"],
    matches: (ctx) =>
      ctx.startingAmount > 0 && ctx.amount <= ctx.startingAmount * 0.88 && ctx.amount >= ctx.startingAmount * 0.78,
  },
];

let lastReactionClip = null;

export function announceNewLowestBid(amount, currency, context = {}) {
  const dropSize = context.previousAmount != null ? context.previousAmount - amount : null;
  const ctx = { ...context, amount, dropSize, isCad: isCAD(currency) };
  const special = SPECIAL_REACTIONS.find((r) => r.matches(ctx));
  const cad = isCAD(currency);
  const generic = cad ? BID_REACTION_CLIPS_EN : BID_REACTION_CLIPS;
  let pool = special ? (cad ? special.clipsEn : special.clips) : generic;
  // A special reaction with a single clip (e.g. "big drop") fires on every
  // bid in a run of large drops and played verbatim each time; fall back to
  // the generic pool rather than repeat the clip that just played.
  if (pool.length === 1 && pool[0] === lastReactionClip) pool = generic;
  const fresh = pool.filter((c) => c !== lastReactionClip);
  const choices = fresh.length ? fresh : pool;
  const reaction = choices.length ? choices[Math.floor(Math.random() * choices.length)] : null;
  if (reaction) lastReactionClip = reaction;
  return {
    // No reaction clip available (India's generic pool is empty): say nothing
    // here rather than speak the bare amount — callers play parts[0] only.
    special: Boolean(special),
    parts: reaction ? [{ clip: reaction }, ...amountToSpeechParts(amount, currency)] : [],
    visual: `📉 New lowest bid: ${formatMoney(amount, currency)}`,
  };
}


// "Meena just brought it down to $3,800. Who's answering that?" — Canada only.
// The bidder's first name is spoken live (the same live voice as the amounts),
// sandwiched between recorded lead-ins, then the amount, then a short tail.
// One line carries the whole bid announcement, so the Call 1 line that
// normally follows a bid stays quiet (see markNamedBid in sound.js).
// First name only: "Manu Tom Varghese" -> "Manu". Long full names are a
// mouthful on every bid, and a first name is what a real auctioneer says.
export function spokenName(fullName) {
  return String(fullName || "").trim().split(/\s+/)[0] || "";
}

const NAMED_LEADS = [
  { pre: null, post: "nm-1-post" },
  // The "Oh!" lead-in (nm-2-pre) was too theatrical and is no longer used.
  { pre: null, post: "nm-2-post" },
  { pre: null, post: "nm-4-post" },
];
let lastNamedLead = -1;
const TAILS = ["tail-1", "tail-2", "tail-3"];
let lastTail = -1;

// A shuffled-without-immediate-repeat pick, for the closing question after an amount.
export function nextTailClip() {
  let i = Math.floor(Math.random() * TAILS.length);
  if (i === lastTail) i = (i + 1) % TAILS.length;
  lastTail = i;
  return `${V2}/${TAILS[i]}.mp3`;
}

// sameBidder: this member already bid earlier in this auction and is back
// after being outbid ("Meena is back again!"). The app never lets the current
// lowest bidder bid again, so it can only be someone who was overtaken.
// atFloor: nothing lower is allowed, so no "can anyone beat that?" tail.
export function announceNamedBid(fullName, amount, currency, { sameBidder = false, atFloor = false } = {}) {
  const name = spokenName(fullName);
  if (!CA_VOICE_V2 || !isCAD(currency) || !name) return null;
  const parts = [];
  if (sameBidder) {
    parts.push(namePart(name), { clip: `${V2}/nm-3-post.mp3` });
  } else {
    let i = Math.floor(Math.random() * NAMED_LEADS.length);
    if (i === lastNamedLead) i = (i + 1) % NAMED_LEADS.length;
    lastNamedLead = i;
    const lead = NAMED_LEADS[i];
    if (lead.pre) parts.push({ clip: `${V2}/${lead.pre}.mp3` });
    parts.push(namePart(name), { clip: `${V2}/${lead.post}.mp3` });
  }
  parts.push(...amountToSpeechParts(amount, currency));
  if (!atFloor) parts.push({ clip: sameBidder ? `${V2}/tail-b2b.mp3` : nextTailClip() });
  return { parts };
}

// Nudges the room when a call stage has gone quiet for a while with no new
// bid — a real auctioneer doesn't just silently wait out the clock.
// "first" fires at the stage's halfway point; "second" is a firmer escalation
// close to the end if it's still silent. Each fires at most once per stage.
export function announceSilence(tier = "first", currency) {
  const cad = isCAD(currency);
  const clip = tier === "second"
    ? (cad ? "/audio/en/silence-nudge-2.mp3" : "/audio/silence-nudge-2.mp3")
    : (cad ? "/audio/en/silence-nudge.mp3" : "/audio/silence-nudge.mp3");
  return {
    parts: [{ clip }],
    visual: tier === "second" ? "🤫 Still no bids — come on, someone bid!" : "🤫 No bids yet — come on, someone bid!",
  };
}

// Auctioneer chatter during the longer call stages — without it, a 30s
// Call 1 or 20s Call 2 with bids already in is just silence between the
// fixed call clips. "hold" lines are interchangeable keep-it-going prompts;
// "final-warning" and "last-seconds" are the two urgency beats. India's are
// spoken, colloquial Tamil (with the English words people actually use at an
// auction: bid, final call, chance), not formal written Tamil.
const STAGE_CHATTER_CLIPS = {
  // 3 ("kammi bid vandhiruku…") didn't sound right to a Tamil ear, and 6 was
  // a second dividend line — two of five keep-going lines about the dividend
  // made it repeat too often, so only hold-2 ("Dividend kammi aagum pa…")
  // stays.
  // 9 ("pa pa pa bid podunga…") was rejected as not sounding right.
  hold: [1, 2, 4, 5, 7, 8, 10].map((n) => `/audio/stage-hold-${n}.mp3`),
  "final-warning": ["/audio/stage-urgent-1.mp3"],
  "last-seconds": ["/audio/stage-urgent-2.mp3"],
};
const STAGE_CHATTER_CLIPS_EN = {
  hold: CA_VOICE_V2
    // hold-3 ("Don't be shy, folks…") was dropped — it didn't sound right.
    // 7-12: "room is heating up", "real contest", "great price… lower?", dividend,
    // "serious bidders", "sharpen your pencils" — more life between bids.
    ? [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => `${V2}/hold-${n}.mp3`)
    : [1, 2, 3, 4, 5, 6].map((n) => `/audio/en/stage-hold-${n}.mp3`),
  "final-warning": ["/audio/en/stage-urgent-1.mp3"],
  "last-seconds": ["/audio/en/stage-urgent-2.mp3"],
};
// Each kind is played through a shuffled "bag": every line is used once
// before any repeats, and the first line of a refill never equals the last
// one played. Picking at random each time put the same line (e.g. hold-6)
// three times in one auction while others never played.
const chatterBag = {};
const lastChatterPick = {};

// kind: "hold" | "final-warning" | "last-seconds".
export function announceStageChatter(kind, currency) {
  const pool = (isCAD(currency) ? STAGE_CHATTER_CLIPS_EN : STAGE_CHATTER_CLIPS)[kind];
  if (!pool?.length) return null;
  const bagKey = `${isCAD(currency) ? "en" : "in"}:${kind}`;
  if (!chatterBag[bagKey]?.length) {
    const bag = pool.map((_, i) => i);
    for (let k = bag.length - 1; k > 0; k--) {
      const r = Math.floor(Math.random() * (k + 1));
      [bag[k], bag[r]] = [bag[r], bag[k]];
    }
    // Don't open a new round with the line that just played.
    if (bag.length > 1 && bag[bag.length - 1] === lastChatterPick[bagKey]) {
      [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
    }
    chatterBag[bagKey] = bag;
  }
  const i = chatterBag[bagKey].pop();
  lastChatterPick[bagKey] = i;
  return { parts: [{ clip: pool[i] }] };
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
