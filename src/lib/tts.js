import { supabase } from "@/api/base44Client";
import { isSoundEnabled } from "./soundPrefs";

// Tries the secure server-side voice (supabase/functions/tts-speak) first —
// once a provider key (ElevenLabs / Google / Azure) is configured there,
// this gets a real human-sounding Tamil clip back. If no provider is
// configured yet, or the call fails for any reason (offline, cold start,
// rate limit), falls back to the browser's own speechSynthesis so the
// auction is never silently silent while waiting on a paid service.
//
// Every call goes through one shared queue so two announcements can never
// play over each other — each one fully finishes (or times out) before the
// next starts, instead of the earlier version where a `cancel()` inside a
// second call could cut the first one off mid-sentence.
let queue = Promise.resolve();
const MAX_WAIT_MS = 8000;

// `force` bypasses the sound-off preference — for an explicit "Test Voice"
// button, where the admin clicking it IS the request to hear it, not an
// ambient sound that should stay muted by default.
export function speakSmart(text, { voiceId, lang = "ta-IN", force = false } = {}) {
  if ((!force && !isSoundEnabled()) || !text) return Promise.resolve();
  const next = queue.then(() => speakOnce(text, voiceId, lang));
  // Never let one bad/stuck clip jam the queue for everything after it.
  queue = next.catch(() => {});
  return next;
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
      // A real Tamil-language voice if this device happens to have one
      // installed; otherwise fall back further to any English voice rather
      // than an unpredictable random default.
      const preferred =
        voices.find((v) => v.lang?.toLowerCase().startsWith("ta")) ||
        voices.find((v) => /en/i.test(v.lang));
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
