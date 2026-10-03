import { supabase } from "@/api/base44Client";
import { isSoundEnabled } from "./soundPrefs";

// Tries the secure server-side voice (supabase/functions/tts-speak) first —
// once a provider key (ElevenLabs / Google / Azure) is configured there,
// this gets a real human-sounding clip back. If no provider is configured
// yet, or the call fails for any reason (offline, cold start, rate limit),
// falls back to the browser's own speechSynthesis so the auction is never
// silently silent while waiting on a paid service.
//
// Every announcement goes through one shared queue so two can never play
// over each other. A strict queue alone drifts out of sync with a live
// auction though: one call is 8-15s of speech and a final-call count is
// longer, so with bids landing every few seconds the audio ran further and
// further behind and kept talking after the auction had closed. So each
// queued announcement is a "job" that can be:
//   - dropped if it waited too long to start (a "keep going" line 15s late
//     is wrong, not just late) -- see maxAgeMs,
//   - cancelled by tag when the auction moves on (new call stage, close),
//     which also stops audio that is already playing, not just the queue.
const MAX_WAIT_MS = 8000;
const DEFAULT_MAX_AGE_MS = 6000;

let queue = Promise.resolve();
const jobs = new Set();
// Set once the server says no TTS provider is configured, so every later
// amount doesn't pay a network round trip just to be told the same thing.
let remoteUnavailable = false;

function enqueue(run, { maxAgeMs = DEFAULT_MAX_AGE_MS, tag = "general" } = {}) {
  const job = { tag, cancelled: false, stops: new Set(), queuedAt: Date.now() };
  jobs.add(job);
  const next = queue
    .then(() => {
      if (job.cancelled || Date.now() - job.queuedAt > maxAgeMs) return undefined;
      return run(job);
    })
    .finally(() => jobs.delete(job));
  // Never let one bad/stuck clip jam the queue for everything after it.
  queue = next.catch(() => {});
  return next;
}

// Stops everything queued or currently playing, except announcements whose
// tag is in keepTags. Cancelled jobs resolve immediately, so later jobs
// don't wait behind them.
export function cancelAnnouncements({ keepTags = [] } = {}) {
  jobs.forEach((job) => {
    if (keepTags.includes(job.tag)) return;
    job.cancelled = true;
    job.stops.forEach((stop) => {
      try { stop(); } catch { /* already finished */ }
    });
    job.stops.clear();
  });
}

export function speakSmart(text, { voiceId, lang = "en-IN", ...opts } = {}) {
  if (!isSoundEnabled() || !text) return Promise.resolve();
  return enqueue((job) => speakText(text, voiceId, lang, job), opts);
}

// Plays a mixed sequence of pre-recorded clips and live-spoken text, in
// order, through the same shared queue — e.g. the real auctioneer clip
// "Call one!" followed by the live-spoken current amount, which changes
// every bid and can't be pre-recorded. Each part is either
// { clip: "/audio/x.wav" } or { text: "..." }.
// opts: { tag, maxAgeMs } — see enqueue(). Use maxAgeMs: Infinity for
// anything that must be heard no matter how late (the closing sequence).
export function speakAnnouncement(parts, opts) {
  if (!isSoundEnabled() || !parts?.length) return Promise.resolve();
  prefetchParts(parts);
  return enqueue((job) => playParts(parts, job), opts);
}

async function playParts(parts, job) {
  for (const part of parts) {
    if (job.cancelled) return;
    if (part.clip) {
      await playClip(part.clip, job);
    } else if (part.text) {
      await speakText(part.text, part.voiceId, part.lang || "en-IN", job);
    } else if (part.pause) {
      // A silent gap — e.g. the Final Call's "pause and wait" beats between
      // oru/rendu/moonu tharam. Without this, back-to-back clips play as one
      // continuous read instead of three distinct, suspenseful calls.
      await wait(part.pause, job);
    }
  }
}

// Registers a way to cut this step short (cancel, or the MAX_WAIT_MS
// timeout) and guarantees the audio is actually stopped when that happens —
// the old plain timeout let the queue move on while the clip or utterance
// kept playing underneath whatever came next.
function stoppable(job, ms, start) {
  return new Promise((resolve) => {
    let finished = false;
    let cleanup = () => {};
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      job.stops.delete(stop);
      resolve();
    };
    const stop = () => {
      try { cleanup(); } catch { /* nothing playing */ }
      finish();
    };
    const timer = setTimeout(stop, ms);
    job.stops.add(stop);
    if (job.cancelled) { stop(); return; }
    try {
      cleanup = start(finish) || cleanup;
    } catch {
      finish();
    }
  });
}

function wait(ms, job) {
  return stoppable(job, ms + 50, (finish) => {
    const t = setTimeout(finish, ms);
    return () => clearTimeout(t);
  });
}

function playClip(src, job) {
  return stoppable(job, MAX_WAIT_MS, (finish) => {
    const audio = new Audio(src);
    audio.onended = finish;
    audio.onerror = finish;
    audio.play().catch(finish);
    return () => { audio.onended = null; audio.pause(); };
  });
}

async function speakText(text, voiceId, lang, job) {
  if (!remoteUnavailable) {
    const ok = await playRemote(text, voiceId, lang, job).catch(() => false);
    if (ok || job.cancelled) return;
  }
  await fallbackSpeak(text, lang, job);
}

// Spoken text is fetched as soon as an announcement is QUEUED (not when its
// turn comes) and kept by text, so the network round trip overlaps whatever
// is still playing, and the same amount repeated across Call 1 / Call 2 /
// Final Call plays instantly the second time. Before this, every amount was
// a fresh sequential fetch (~1-3s) in the middle of every line.
const ttsCache = new Map();

function fetchTts(text, voiceId, lang) {
  const key = `${lang}|${voiceId || ""}|${text}`;
  if (!ttsCache.has(key)) {
    const p = supabase.functions
      .invoke("tts-speak", { body: { text, voiceId, lang } })
      .then(({ data, error }) => {
        if (data?.error === "not_configured") remoteUnavailable = true;
        const audio = error || !data?.audioBase64 ? null : data.audioBase64;
        if (!audio) ttsCache.delete(key);
        return audio;
      })
      .catch(() => {
        ttsCache.delete(key);
        return null;
      });
    ttsCache.set(key, p);
  }
  return ttsCache.get(key);
}

function prefetchParts(parts) {
  // Canada's recorded name/amount/lead-in clips are tiny; warming them as
  // the line is queued keeps the joins between them tight.
  parts.forEach((part) => {
    if (part.clip?.startsWith("/audio/en/v2/")) {
      try {
        const warm = new Audio(part.clip);
        warm.preload = "auto";
      } catch { /* just means no warm-up */ }
    }
  });
  if (remoteUnavailable) return;
  parts.forEach((part) => {
    if (part.text) fetchTts(part.text, part.voiceId, part.lang || "en-IN");
  });
}

async function playRemote(text, voiceId, lang, job) {
  const audioBase64 = await fetchTts(text, voiceId, lang);
  if (!audioBase64) return false;
  if (job.cancelled) return true;
  await playClip(`data:audio/mpeg;base64,${audioBase64}`, job);
  return true;
}

function fallbackSpeak(text, lang, job) {
  if (typeof window === "undefined" || !window.speechSynthesis) return Promise.resolve();
  return stoppable(job, MAX_WAIT_MS, (finish) => {
    // Chrome has a long-standing bug where speechSynthesis silently pauses
    // itself ~15s into an utterance (or a queue of them) and, on some
    // builds, repeats the current utterance instead of just stalling —
    // exactly the "900 dollars" firing several times in a row this was
    // written to fix. The documented workaround is to keep kicking
    // pause()+resume() while anything is actually speaking, which stops
    // the engine from ever reaching that stuck/repeating state.
    const keepAlive = setInterval(() => {
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 4000);
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang;
    utter.rate = 1.0;
    utter.pitch = 1.0;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find((v) => /en/i.test(v.lang));
    if (preferred) utter.voice = preferred;
    const done = () => { clearInterval(keepAlive); finish(); };
    utter.onend = done;
    utter.onerror = done;
    window.speechSynthesis.cancel(); // never let a prior stuck utterance linger into this one
    window.speechSynthesis.speak(utter);
    return () => {
      clearInterval(keepAlive);
      utter.onend = null;
      utter.onerror = null;
      window.speechSynthesis.cancel();
    };
  });
}
