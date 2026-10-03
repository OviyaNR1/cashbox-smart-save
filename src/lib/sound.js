import { isSoundEnabled } from "./soundPrefs";
import { speakAnnouncement, cancelAnnouncements } from "./tts";
import { amountToSpeechParts } from "./numberSpeech";
import { CA_VOICE_V2, nextTailClip } from "./auctionAnnouncements";

let ctx;

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

// True once the browser has allowed audio on this page (the AudioContext is
// running). Used to show a "tap to turn on sound" prompt to members.
export function isAudioUnlocked() {
  try {
    return getCtx().state === "running";
  } catch {
    return false;
  }
}

// Browsers refuse to actually produce sound from an AudioContext until it's
// been resumed from inside a real user gesture (click/tap/key) at least
// once on the page. On the admin's own Live Auction page, Call1/Sold work
// because speak()/playCallBell() etc. are called directly from the admin's
// own button click, which satisfies that on its own. But a member watching
// the SAME auction sees the call stage / sold announcement arrive over a
// Realtime subscription — driven entirely by the admin's remote action, with
// no local click anywhere in that call stack — so without priming, several
// mobile browsers silently refuse to actually voice it the first time.
// speechSynthesis has this same gesture requirement but is a separate API
// from AudioContext, so it needs its own unlock, not just getCtx()'s.
// Call this from the first user gesture the app sees so both are already
// unlocked by the time an async event needs to play a sound or speak.
export function primeAudio() {
  try {
    getCtx();
  } catch {
    // Web Audio unavailable — ignore, individual sound calls fail silently too.
  }
  try {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      const utter = new SpeechSynthesisUtterance("");
      utter.volume = 0;
      window.speechSynthesis.speak(utter);
    }
  } catch {
    // Speech synthesis unavailable — ignore, speak() fails silently too.
  }
  try {
    // A third, separate unlock domain from AudioContext/speechSynthesis —
    // the pre-recorded Oru/Rendu/Moonu Tharam term clips and the smart-voice
    // remote clips both play via a plain HTMLAudioElement (new Audio().play()),
    // which browsers gate independently. Without this, a member's very first
    // clip of the session (always arriving via a realtime event, never a
    // click) silently fails even though the tones/speech above are unlocked.
    // A muted, near-instant silent WAV played once here satisfies the
    // gesture requirement for every later programmatic .play() on the page.
    const unlock = new Audio(
      "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="
    );
    unlock.muted = true;
    unlock.play().then(() => unlock.pause()).catch(() => {});
  } catch {
    // ignore
  }
}

function tone(freq, start, duration, type = "sine", gainPeak = 0.2) {
  const c = getCtx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, c.currentTime + start);
  gain.gain.linearRampToValueAtTime(gainPeak, c.currentTime + start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + start + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(c.currentTime + start);
  osc.stop(c.currentTime + start + duration + 0.05);
}

function noiseBurst(start, duration, gainPeak = 0.3) {
  const c = getCtx();
  const bufferSize = Math.max(1, Math.floor(c.sampleRate * duration));
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  const src = c.createBufferSource();
  src.buffer = buffer;
  const gain = c.createGain();
  gain.gain.setValueAtTime(gainPeak, c.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + start + duration);
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 700;
  src.connect(filter).connect(gain).connect(c.destination);
  src.start(c.currentTime + start);
}

// Ding — signals a new call stage (Call 1 / Call 2 / Final Call).
export function playCallBell() {
  if (!isSoundEnabled()) return;
  try {
    tone(1046.5, 0, 0.25, "sine", 0.25);
    tone(1567.98, 0.05, 0.3, "sine", 0.15);
  } catch {
    // Web Audio unavailable or blocked — fail silently.
  }
}

// Two sharp knocks — the auction has closed.
export function playGavel() {
  if (!isSoundEnabled()) return;
  try {
    noiseBurst(0, 0.1, 0.45);
    noiseBurst(0.2, 0.12, 0.45);
  } catch {
    // ignore
  }
}

// Short ascending chime — the winner's celebration moment.
export function playFanfare() {
  if (!isSoundEnabled()) return;
  try {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => tone(freq, i * 0.12, 0.3, "triangle", 0.25));
  } catch {
    // ignore
  }
}

// A bright, quick three-note "coin drop" — a new bid was placed. Distinct
// from playCallBell (call-stage change) and playNewMessage (chat) so it
// reads unmistakably as "someone bid," not just generic activity.
// When the last bid chime played. The countdown from the stage that the bid
// just interrupted can still fire one more tick a beat after the chime (the
// page only learns the stage restarted after a reload), which sounded like a
// second beep right behind it — so ticks stay silent briefly after a chime.
let lastBidChimeAt = 0;
const TICK_QUIET_AFTER_BID_MS = 1500;

export function playBidPlaced() {
  if (!isSoundEnabled()) return;
  lastBidChimeAt = Date.now();
  try {
    tone(1318.51, 0, 0.09, "square", 0.18);
    tone(1567.98, 0.07, 0.09, "square", 0.18);
    tone(2093.0, 0.14, 0.14, "square", 0.2);
  } catch {
    // ignore
  }
}

// Two rising notes — someone joined the live auction room.
export function playMemberJoin() {
  if (!isSoundEnabled()) return;
  try {
    tone(659.25, 0, 0.12, "sine", 0.15);
    tone(880, 0.08, 0.16, "sine", 0.15);
  } catch {
    // ignore
  }
}

// Two falling notes, lower and softer than the join chime — someone left.
export function playMemberLeave() {
  if (!isSoundEnabled()) return;
  try {
    tone(587.33, 0, 0.12, "sine", 0.12);
    tone(440, 0.08, 0.16, "sine", 0.12);
  } catch {
    // ignore
  }
}

// A brighter double-tone — you were @mentioned in the chat.
export function playMention() {
  if (!isSoundEnabled()) return;
  try {
    tone(987.77, 0, 0.1, "triangle", 0.2);
    tone(1318.51, 0.1, 0.18, "triangle", 0.2);
  } catch {
    // ignore
  }
}

// A single soft pop — someone sent a regular chat or voice message (not a
// mention, not a join/leave). Distinct from all three of those.
export function playNewMessage() {
  if (!isSoundEnabled()) return;
  try {
    tone(740, 0, 0.09, "sine", 0.16);
  } catch {
    // ignore
  }
}

// Soft per-second tick while a call-stage countdown is running.
export function playTick() {
  if (!isSoundEnabled()) return;
  try {
    tone(880, 0, 0.05, "square", 0.08);
  } catch {
    // ignore
  }
}

// Sharper, louder tick for the last few seconds of a countdown.
export function playUrgentTick() {
  if (!isSoundEnabled()) return;
  try {
    tone(1200, 0, 0.07, "square", 0.2);
  } catch {
    // ignore
  }
}

// A distinct cue for each stage change, so moving from Call 1 to Call 2 to
// Final Call is heard and not just seen: Call 1 keeps the plain bell, Call 2
// gets a rising three-note chime, Final Call a low drum hit followed by an
// urgent rising alarm.
export function playStageChange(status) {
  if (!isSoundEnabled()) return;
  try {
    if (status === "call_2") {
      [784, 1046.5, 1318.5].forEach((freq, i) => tone(freq, i * 0.13, 0.28, "triangle", 0.28));
    } else if (status === "final_call") {
      tone(110, 0, 0.5, "sine", 0.5);
      noiseBurst(0, 0.18, 0.5);
      [1046.5, 1318.5, 1760].forEach((freq, i) => tone(freq, 0.22 + i * 0.11, 0.1, "square", 0.22));
      tone(2093, 0.58, 0.35, "square", 0.22);
    } else {
      playCallBell();
    }
  } catch {
    // ignore
  }
}

// Per-second tick, different for each stage: a soft tick in Call 1, a
// brighter one in Call 2, and in Final Call a double tick every second the
// whole way through. The last 5 seconds of Call 1/2 keep the sharp urgent tick.
export function playStageTick(status, secondsLeft) {
  if (!isSoundEnabled()) return;
  if (Date.now() - lastBidChimeAt < TICK_QUIET_AFTER_BID_MS) return;
  try {
    if (status === "final_call") {
      tone(1568, 0, 0.06, "square", 0.22);
      tone(1568, 0.14, 0.06, "square", 0.22);
    } else if (secondsLeft <= 5) {
      playUrgentTick();
    } else if (status === "call_2") {
      tone(1175, 0, 0.06, "triangle", 0.16);
    } else {
      playTick();
    }
  } catch {
    // ignore
  }
}

// The call-stage label — called out against the current lowest bid before
// it's sold, instead of a generic "any lower bids?". Shared between the
// admin's calling screen and members' live view so both sides announce and
// display the identical wording.
export const CALL_TERMS = { call_1: "Call 1", call_2: "Call 2", final_call: "Final Call" };

// Builds the on-screen call-out text for a stage — e.g. "₹90,000. Call 1".
// amountLabel is a pre-formatted currency string (formatMoney's output);
// pass none for a plan/currency-less fallback that's just the bare term.
// Display-only — see speakCallAnnouncement for the spoken version.
export function callAnnouncement(status, amountLabel) {
  const term = CALL_TERMS[status];
  if (!term) return "";
  return amountLabel ? `${amountLabel}. ${term}` : term;
}

// Real recorded clips of the fixed call-stage phrases, split around where
// the amount goes — e.g. call_1 is "Okay Members... current lowest" [amount]
// "Yaaravadhu kammi ah start panna pogareengala? Come on!". A live browser
// voice reading a fixed line every time is exactly what sounds robotic; a
// real recorded clip doesn't. The amount changes with every bid and can't
// be pre-recorded whole, so it's spoken live via amountToSpeechParts and
// sandwiched between the fixed clips.
//
// final_call is the traditional Tamil auctioneer count — the amount is
// restated before each of three clips ("...oru tharam", "...rendu tharam",
// "...moonu tharam!"), building suspense the same way a real chit-fund
// auctioneer counts down, instead of an English "once/twice/final call".
//
// India's clips are Tamil, all spoken by the same auctioneer character —
// Higgsfield/ElevenLabs preset voice "Dylan" (voice_id
// b847bc29-f184-583a-8ad9-d1f1e16d1a60), confirmed from the actual
// generation history. Canada explicitly must never hear Tamil/Malayalam,
// but should still hear that same character — public/audio/en/* was
// generated with that identical voice/model speaking English instead.
const CALL_AUDIO = {
  call_1: { a: "/audio/call-1-a.mp3", b: "/audio/call-1-b.mp3" },
  call_2: { a: "/audio/call-2-a.mp3", b: "/audio/call-2-b.mp3" },
};
const CALL_AUDIO_EN = {
  call_1: { a: "/audio/en/call-1-a.mp3", b: "/audio/en/call-1-b.mp3" },
  // "Going twice… last chance, everyone…" [amount] — no closing question.
  call_2: CA_VOICE_V2
    ? { a: "/audio/en/v2/call-2-a.mp3", b: null }
    : { a: "/audio/en/call-2-a.mp3", b: "/audio/en/call-2-b.mp3" },
};

// Canada: a bid announcement that already named the bidder and said the new
// amount (announceNamedBid) is the whole call line, so the Call 1 line the
// same bid triggers must not repeat the amount a second time.
let namedBidAt = 0;
export function markNamedBid(at = Date.now()) {
  namedBidAt = at;
}
// Pause after each round — "Pause and wait" / "Longer pause" / "Short
// dramatic pause" per spec — so oru/rendu/moonu tharam (or, for Canada,
// "Going once/twice/three times") land as three distinct suspenseful calls
// instead of one continuous read. No pause after the last one; whatever
// triggers the close announcement provides its own gap.
const FINAL_CALL_CLIPS = [
  { clip: "/audio/final-oru-tharam.mp3", pauseAfter: 1500 },
  { clip: "/audio/final-rendu-tharam.mp3", pauseAfter: 2200 },
  { clip: "/audio/final-moonu-tharam.mp3", pauseAfter: 0 },
];
const FINAL_CALL_CLIPS_EN = [
  { clip: "/audio/en/final-once.mp3", pauseAfter: 1500 },
  { clip: "/audio/en/final-twice.mp3", pauseAfter: 2200 },
  { clip: "/audio/en/final-three-times.mp3", pauseAfter: 0 },
];

// How many Call 1 lines each auction has already had. Every new bid restarts
// Call 1, and replaying the full "okay members, current lowest <amount>,
// anyone going lower?" speech after every single bid (right after the bid
// reaction has already said the new amount) is what made the room sound
// like a loop. The first Call 1 of an auction gets the full line; restarts
// after that say just the new amount — the "yaaravadhu kammiya…" /
// "Can anyone go lower? Come on!" invitation is heard once per auction, not
// again on every restart (the mid-call lines carry the encouragement). Applies
// to both India and Canada; English repeated it after every bid too.
const call1Spoken = new Map();

// atFloor: the current lowest bid has already hit the plan's minimum
// allowed bid — no lower bid can legally be accepted from here. Call 1/2's
// "b" line is specifically the "yaaraavadhu kammiya bidding panreengala" /
// "can anyone go lower" invitation to bid even lower, which would be
// actively misleading at that point, so it's dropped — just the amount is
// announced, no invitation.
export function speakCallAnnouncement(status, amount, currency, atFloor = false, auctionId = null) {
  if (!isSoundEnabled()) return;
  const cad = currency === "CAD";
  // A new call stage makes every earlier line stale — the previous call's
  // clips, the keep-going chatter, a final-call count still mid-sentence for
  // a price that was just outbid. Cut them (including audio already playing)
  // instead of letting them finish behind the new call. The short bid
  // reaction is kept: it belongs to the bid that usually triggered this.
  cancelAnnouncements({ keepTags: ["reaction"] });
  const opts = { tag: "call", maxAgeMs: 8000 };
  if (status === "final_call") {
    const amountParts = amount != null ? amountToSpeechParts(amount, currency) : [];
    const parts = [];
    if (cad) {
      // The final call only lasts 10s, and restating the amount before each
      // of the three counts (the traditional Tamil format kept for India)
      // pushed the English one to ~20s, so it was still counting after the
      // auction had closed. Amount once, then the three counts back to back.
      // When the bid line that just played already said the amount (a bid at the
      // floor goes straight to Final Call), it isn't repeated — that doubled the
      // amount and pushed the count past the end of the Final Call.
      if (!(CA_VOICE_V2 && Date.now() - namedBidAt < 15000)) parts.push(...amountParts);
      FINAL_CALL_CLIPS_EN.forEach((round, i, all) => {
        parts.push({ clip: round.clip });
        if (i < all.length - 1) parts.push({ pause: 700 });
      });
    } else {
      // Same fix as the English one: the amount before every count plus the
      // long pauses made this ~22s for a final call that lasts 16s, so the
      // count was still going after the screen said bidding had closed.
      // Amount once, then oru / rendu / moonu tharam with short beats (~15s).
      parts.push(...amountParts);
      FINAL_CALL_CLIPS.forEach((round, i, all) => {
        parts.push({ clip: round.clip });
        if (i < all.length - 1) parts.push({ pause: 700 });
      });
    }
    speakAnnouncement(parts, opts);
    return;
  }
  const lines = (cad ? CALL_AUDIO_EN : CALL_AUDIO)[status];
  if (!lines) return;
  if (status === "call_1" && cad && CA_VOICE_V2) {
    if (Date.now() - namedBidAt < 5000) return;
    // Every Call 1 in Canada is "$3,800… <closing question>" — the room has
    // already had the bidder's name from the reaction line.
    speakAnnouncement([...(amount != null ? amountToSpeechParts(amount, currency) : []), ...(atFloor ? [] : [{ clip: nextTailClip() }])], opts);
    return;
  }
  if (status === "call_1" && auctionId) {
    const seen = call1Spoken.get(auctionId) || 0;
    call1Spoken.set(auctionId, seen + 1);
    if (seen > 0) {
      // The bid reaction is just a clip, so the amount still has to be said
      // once — only the repeated "okay members…" intro and the invitation
      // line are dropped.
      const restartParts = amount != null ? amountToSpeechParts(amount, currency) : [];
      speakAnnouncement(restartParts, opts);
      return;
    }
  }
  const parts = [{ clip: lines.a }];
  if (amount != null) parts.push(...amountToSpeechParts(amount, currency));
  if (!atFloor && lines.b) parts.push({ clip: lines.b });
  speakAnnouncement(parts, opts);
}
