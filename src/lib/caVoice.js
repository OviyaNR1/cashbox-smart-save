// Canada's livelier auctioneer: one switch plus the recorded Dylan clips for
// dollar amounts and member first names, so a whole bid line is one voice.
// Setting CA_VOICE_V2 to false puts the previous English voice back exactly
// as it was. India never reads any of this.
export const CA_VOICE_V2 = true;
export const V2 = "/audio/en/v2";

// Every $50 from $3,500 to $4,750 is recorded (Canada's range: floor to
// starting amount). Any other amount falls back to the live-spoken voice.
const AMOUNT_MIN = 3500;
const AMOUNT_MAX = 4750;

export function amountClip(amount) {
  const n = Number(amount);
  if (!CA_VOICE_V2 || !Number.isInteger(n) || n < AMOUNT_MIN || n > AMOUNT_MAX || n % 50 !== 0) return null;
  return `${V2}/amt/${n}.mp3`;
}

// First names of the Canada group, keyed by lowercase. A name that isn't here
// (a new member) falls back to the live-spoken voice until it is recorded.
// Geethamani is said "Geedha Mani" in the recording.
const NAME_CLIPS = ["aghil", "walter", "manu", "arpit", "albin", "shameer", "shabana", "bhavan", "geethamani"];

export function nameClip(firstName) {
  const key = String(firstName || "").toLowerCase();
  return CA_VOICE_V2 && NAME_CLIPS.includes(key) ? `${V2}/names/${key}.mp3` : null;
}
