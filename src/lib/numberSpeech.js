// Turns a rupee amount into a single natural spoken phrase via a real TTS
// provider (Google Cloud TTS, see supabase/functions/tts-speak) instead of
// concatenating individually pre-recorded number-tile clips — e.g. 9700
// becomes one continuous "nine thousand seven hundred rupees" utterance.
// Stitching separate word-clips (the previous approach) left an audible gap
// at every seam, since each clip's own silence padding stacks up — a single
// generated phrase has none of that. Amounts change every bid and can't be
// pre-recorded whole, so this is the one part of the announcement script
// that's genuinely spoken live rather than played from a fixed clip.

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function wordsUnder100(n) {
  if (n < 20) return n === 0 ? [] : [ONES[n]];
  const tens = Math.floor(n / 10);
  const rest = n % 10;
  const words = [TENS[tens]];
  if (rest) words.push(ONES[rest]);
  return words;
}

function wordsUnder1000(n) {
  const words = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds) words.push(ONES[hundreds], "hundred");
  words.push(...wordsUnder100(rest));
  return words;
}

// Indian numbering system — lakh (1,00,000), thousand, hundred.
export function amountToWords(amount) {
  let n = Math.round(Math.abs(amount || 0));
  if (n === 0) return ["zero"];
  const words = [];
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const rest = n;
  if (lakh) words.push(...wordsUnder100(lakh), "lakh");
  if (thousand) words.push(...wordsUnder100(thousand), "thousand");
  if (rest) words.push(...wordsUnder1000(rest));
  return words;
}

// Builds speakAnnouncement parts (see @/lib/tts) for a rupee amount — one
// { text, lang } part that goes through the live TTS pipeline as a single
// utterance. Non-INR amounts get the same live-text treatment (currency
// code read out) since there's no separate tile set to fall back to.
export function amountToSpeechParts(amount, currency) {
  if (currency && currency !== "INR") {
    return [{ text: `${amount} ${currency}`, lang: "en-IN" }];
  }
  const phrase = [...amountToWords(amount), "rupees"].join(" ");
  return [{ text: phrase, lang: "en-IN" }];
}
