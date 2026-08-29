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

// The traditional South Indian chit-auction call count — "oru tharam" (once),
// "rendu tharam" (twice), "moonu tharam" (thrice) — called out against the
// current lowest bid before it's sold, instead of a generic "any lower
// bids?". Shared between the admin's calling screen and members' live view
// so both sides announce and display the identical wording. Written in
// actual Tamil script, not romanized letters — an English voice reading
// "Oru Tharam" as English letters is exactly what made it sound like a
// generic, mispronounced "AI voice" instead of the real phrase.
export const CALL_TERMS = { call_1: "ஒரு தரம்", call_2: "ரெண்டு தரம்", final_call: "மூணு தரம்" };

// Builds the on-screen call-out text for a stage — e.g. "₹90,000. ஒரு
// தரம்". amountLabel is a pre-formatted currency string (formatMoney's
// output); pass none for a plan/currency-less fallback that's just the bare
// term. Display-only — see speakCallAnnouncement for the spoken version.
export function callAnnouncement(status, amountLabel) {
  const term = CALL_TERMS[status];
  if (!term) return "";
  return amountLabel ? `${amountLabel}. ${term}` : term;
}

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

// Real recorded clips of the Oru/Rendu/Moonu Tharam call terms — no browser
// voice, on any device, actually speaks intelligible Tamil for this (tried
// three different fixes; every device-installed Tamil voice either mangled
// the words or dropped them outright when mixed with the Latin-script
// amount in one utterance). The amount itself is still spoken live via
// speak() below, since it changes with every bid and can't be pre-recorded
// — only these three fixed phrases needed a real voice.
const CALL_AUDIO = {
  call_1: "/audio/call-oru-tharam.mp3",
  call_2: "/audio/call-rendu-tharam.mp3",
  final_call: "/audio/call-moonu-tharam.mp3",
};

// The actual spoken version of a call stage: the amount, spoken live, then
// the recorded Tamil term clip plays right after it finishes.
export function speakCallAnnouncement(status, amountLabel) {
  const term = CALL_TERMS[status];
  if (!term) return;
  const audioSrc = CALL_AUDIO[status];
  const playTerm = () => {
    if (!audioSrc) return;
    try {
      const clip = new Audio(audioSrc);
      // Slightly faster than the recorded pace — the browser keeps pitch
      // steady at this small a bump, so it just sounds a bit snappier
      // rather than higher-pitched or rushed.
      clip.playbackRate = 1.15;
      clip.play().catch(() => {});
    } catch {
      // Audio playback unavailable — fail silently, same as speak() does.
    }
  };
  if (!amountLabel) {
    playTerm();
    return;
  }
  try {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      playTerm();
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(amountLabel);
    utter.rate = 1.15; // matches the term clip's slightly-faster pace below
    utter.pitch = 0.9;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find((v) => /en/i.test(v.lang));
    if (preferred) utter.voice = preferred;
    // Play the term once the amount finishes — onerror too, so a browser
    // that can't speak the amount at all still gets the term.
    utter.onend = playTerm;
    utter.onerror = playTerm;
    window.speechSynthesis.speak(utter);
  } catch {
    playTerm();
  }
}
