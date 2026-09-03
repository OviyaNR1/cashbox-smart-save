// Per-viewer sound preference for the live auction — browsers block
// autoplaying audio until a real user gesture unlocks it, and even once
// unlocked, some members simply don't want auction sound effects playing.
// OFF by default on first visit (never auto-plays audio nobody asked for);
// remembered per-browser via localStorage once the member chooses.
const KEY = "cashbox_sound_enabled";

const listeners = new Set();

export function isSoundEnabled() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    // localStorage unavailable (private browsing, blocked storage) — treat
    // as the safe default rather than throwing.
    return false;
  }
}

export function setSoundEnabled(enabled) {
  try {
    localStorage.setItem(KEY, enabled ? "1" : "0");
  } catch {
    // Preference just won't persist across visits — still applies for
    // the rest of this session via the listeners below.
  }
  listeners.forEach((cb) => cb(enabled));
}

export function onSoundPrefChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
