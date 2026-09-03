import { supabase } from "@/api/base44Client";
import { isSoundEnabled } from "./soundPrefs";

// Tries the secure server-side voice (supabase/functions/tts-speak) first —
// once a provider key (ElevenLabs / Google / Azure) is configured there,
// this gets a real human-sounding Tamil clip back. If no provider is
// configured yet, or the call fails for any reason (offline, cold start,
// rate limit), falls back to the browser's own speechSynthesis so the
// auction is never silently silent while waiting on a paid service.
// `force` bypasses the sound-off preference — for an explicit "Test Voice"
// button, where the admin clicking it IS the request to hear it, not an
// ambient sound that should stay muted by default.
export async function speakSmart(text, { voiceId, lang = "ta-IN", force = false } = {}) {
  if ((!force && !isSoundEnabled()) || !text) return;
  try {
    const { data, error } = await supabase.functions.invoke("tts-speak", {
      body: { text, voiceId, lang },
    });
    if (!error && data?.audioBase64) {
      const audio = new Audio(`data:audio/mpeg;base64,${data.audioBase64}`);
      await audio.play();
      return;
    }
  } catch {
    // Edge function unreachable — fall through to the browser fallback below.
  }
  fallbackSpeak(text, lang);
}

function fallbackSpeak(text, lang) {
  try {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
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
    window.speechSynthesis.speak(utter);
  } catch {
    // Speech synthesis unavailable — fail silently, same as the rest of sound.js.
  }
}
