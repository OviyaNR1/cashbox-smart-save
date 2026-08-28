let ctx;

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

// Browsers refuse to actually produce sound from an AudioContext until it's
// been resumed from inside a real user gesture (click/tap/key) at least
// once on the page. Call1/Sold work because they're triggered directly by
// the admin's own button click, which satisfies that on its own — but a
// join/leave sound fires from another person's action arriving over the
// network, with no guarantee *you* clicked anything on your own page first.
// Call this from the first user gesture the app sees so the context is
// already unlocked by the time an async event needs to play a sound.
export function primeAudio() {
  try {
    getCtx();
  } catch {
    // Web Audio unavailable — ignore, individual sound calls fail silently too.
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
  try {
    tone(1046.5, 0, 0.25, "sine", 0.25);
    tone(1567.98, 0.05, 0.3, "sine", 0.15);
  } catch {
    // Web Audio unavailable or blocked — fail silently.
  }
}

// Two sharp knocks — the auction has closed.
export function playGavel() {
  try {
    noiseBurst(0, 0.1, 0.45);
    noiseBurst(0.2, 0.12, 0.45);
  } catch {
    // ignore
  }
}

// Short ascending chime — the winner's celebration moment.
export function playFanfare() {
  try {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => tone(freq, i * 0.12, 0.3, "triangle", 0.25));
  } catch {
    // ignore
  }
}

// Two rising notes — someone joined the live auction room.
export function playMemberJoin() {
  try {
    tone(659.25, 0, 0.12, "sine", 0.15);
    tone(880, 0.08, 0.16, "sine", 0.15);
  } catch {
    // ignore
  }
}

// Two falling notes, lower and softer than the join chime — someone left.
export function playMemberLeave() {
  try {
    tone(587.33, 0, 0.12, "sine", 0.12);
    tone(440, 0.08, 0.16, "sine", 0.12);
  } catch {
    // ignore
  }
}

// A brighter double-tone — you were @mentioned in the chat.
export function playMention() {
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
  try {
    tone(740, 0, 0.09, "sine", 0.16);
  } catch {
    // ignore
  }
}

// Soft per-second tick while a call-stage countdown is running.
export function playTick() {
  try {
    tone(880, 0, 0.05, "square", 0.08);
  } catch {
    // ignore
  }
}

// Sharper, louder tick for the last few seconds of a countdown.
export function playUrgentTick() {
  try {
    tone(1200, 0, 0.07, "square", 0.2);
  } catch {
    // ignore
  }
}

export const CALL_ANNOUNCEMENTS = {
  call_1: "Call one. Any lower bids?",
  call_2: "Call two. Last chance for a lower bid.",
  final_call: "Final call. Going once. Going twice.",
};

// Spoken call-outs via the browser's built-in text-to-speech — no external
// service or API key required, and it works offline.
export function speak(text) {
  try {
    if (typeof window === "undefined" || !window.speechSynthesis || !text) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.05;
    utter.pitch = 0.9;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find((v) => /en/i.test(v.lang));
    if (preferred) utter.voice = preferred;
    window.speechSynthesis.speak(utter);
  } catch {
    // Speech synthesis unavailable — fail silently.
  }
}
