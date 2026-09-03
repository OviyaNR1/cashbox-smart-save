// Sound is always on — no per-viewer toggle. Browsers still gate actual
// playback behind a real user gesture the first time (see primeAudio() in
// sound.js), but that's a technical unlock, not a preference members have
// to remember to flip.
export function isSoundEnabled() {
  return true;
}
