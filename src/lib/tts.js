import { supabase } from "@/api/base44Client";
import { isSoundEnabled } from "./soundPrefs";

// Tries the secure server-side voice (supabase/functions/tts-speak) first —
// once a provider key (ElevenLabs / Google / Azure) is configured there,
// this gets a real human-sounding clip back. If no provider is configured
// yet, or the call fails for any reason (offline, cold start, rate limit),
// falls back to the browser's own speechSynthesis so the auction is never
// silently silent while waiting on a paid service.
//
// Every call goes through one shared queue so two announcements can never
// play over each other — each one fully finishes (or times out) before the
// next starts, instead of a `cancel()` inside a second call cutting the
// first one off mid-sentence.
let queue = Promise.resolve();
const MAX_WAIT_MS = 8000;

export function speakSmart(text, { voiceId, lang = "en-IN" } = {}) {
  if (!isSoundEnabled() || !text) return Promise.resolve();
  const next = queue.then(() => speakOnce(text, voiceId, lang));
  // Never let one bad/stuck clip jam the queue for everything after it.
  queue = next.catch(() => {});
  return next;
}

// Plays a mixed sequence of pre-recorded clips and live-spoken text, in
// order, through the same shared queue — e.g. the real auctioneer clip
// "Call one!" followed by the live-spoken current amount, which changes
// every bid and can't be pre-recorded. Each part is either
// { clip: "/audio/x.wav" } or { text: "..." }.
export function speakAnnouncement(parts) {
  if (!isSoundEnabled() || !parts?.length) return Promise.resolve();
  const next = queue.then(() => playParts(parts));
  queue = next.catch(() => {});
  return next;
}

async function playParts(parts) {
  for (const part of parts) {
    if (part.clip) {
      await withTimeout(playClip(part.clip), MAX_WAIT_MS);
    } else if (part.text) {
      await withTimeout(speakOnce(part.text, part.voiceId, part.lang || "en-IN"), MAX_WAIT_MS);
    } else if (part.pause) {
      // A silent gap — e.g. the Final Call's "pause and wait" beats between
      // oru/rendu/moonu tharam. Without this, back-to-back clips play as one
      // continuous read instead of three distinct, suspenseful calls.
      await new Promise((resolve) => setTimeout(resolve, part.pause));
    }
  }
}

function playClip(src) {
  return new Promise((resolve) => {
    try {
      const audio = new Audio(src);
      audio.onended = resolve;
      audio.onerror = resolve;
      audio.play().catch(resolve);
    } catch {
      resolve();
    }
  });
}

async function speakOnce(text, voiceId, lang) {
  await withTimeout(playRemote(text, voiceId, lang).catch(() => false).then((ok) => ok || fallbackSpeak(text, lang)), MAX_WAIT_MS);
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);
}

async function playRemote(text, voiceId, lang) {
  const { data, error } = await supabase.functions.invoke("tts-speak", {
    body: { text, voiceId, lang },
  });
  if (error || !data?.audioBase64) return false;
  await new Promise((resolve) => {
    const audio = new Audio(`data:audio/mpeg;base64,${data.audioBase64}`);
    audio.onended = resolve;
    audio.onerror = resolve;
    audio.play().catch(resolve);
  });
  return true;
}

function fallbackSpeak(text, lang) {
  return new Promise((resolve) => {
    try {
      if (typeof window === "undefined" || !window.speechSynthesis) return resolve();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = lang;
      utter.rate = 1.0;
      utter.pitch = 1.0;
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find((v) => /en/i.test(v.lang));
      if (preferred) utter.voice = preferred;
      utter.onend = resolve;
      utter.onerror = resolve;
      window.speechSynthesis.speak(utter);
    } catch {
      // Speech synthesis unavailable — fail silently, same as the rest of sound.js.
      resolve();
    }
  });
}
