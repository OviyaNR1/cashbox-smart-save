import { isSoundEnabled } from "./soundPrefs";
import { speakAnnouncement } from "./tts";
import { amountToSpeechParts } from "./numberSpeech";

let ctx;

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
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
export function playBidPlaced() {
  if (!isSoundEnabled()) return;
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
// final_call is a longer suspense sequence with the amount called out three
// times ("...once... ...twice... ...final call!"), not a single a/b pair —
// segments is the list of fixed clips, amount is re-inserted between every
// consecutive pair.
const CALL_AUDIO = {
  call_1: { a: "/audio/call-1-a.mp3", b: "/audio/call-1-b.mp3" },
  call_2: { a: "/audio/call-2-a.mp3", b: "/audio/call-2-b.mp3" },
};
const FINAL_CALL_SEGMENTS = [
  "/audio/call-final-once-a.mp3",
  "/audio/call-final-once-b.mp3",
  "/audio/call-final-twice-b.mp3",
  "/audio/call-final-final-b.mp3",
];

export function speakCallAnnouncement(status, amount, currency) {
  if (!isSoundEnabled()) return;
  if (status === "final_call") {
    const amountParts = amount != null ? amountToSpeechParts(amount, currency) : [];
    const parts = [];
    FINAL_CALL_SEGMENTS.forEach((clip, i) => {
      parts.push({ clip });
      // Amount goes between every pair of segments except after the last
      // one — three insertions for four segments ("once"/"twice"/"final").
      if (i < FINAL_CALL_SEGMENTS.length - 1) parts.push(...amountParts);
    });
    speakAnnouncement(parts);
    return;
  }
  const clips = CALL_AUDIO[status];
  if (!clips) return;
  const parts = [{ clip: clips.a }];
  if (amount != null) parts.push(...amountToSpeechParts(amount, currency));
  parts.push({ clip: clips.b });
  speakAnnouncement(parts);
}
