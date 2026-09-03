// Turns a rupee amount into a sequence of real recorded number-tile clips
// (public/audio/num-*.wav) instead of live browser TTS — e.g. 9700 becomes
// the clips for "nine", "thousand", "seven", "hundred", "rupees", all in
// the same real voice as the rest of the announcement script. Amounts
// change every bid and can't be pre-recorded whole, but the individual
// number words can be, and concatenating them still sounds like one
// consistent voice rather than switching to a robotic fallback.

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

const CLIP_MAP = {
  zero: "/audio/num-0.wav",
  one: "/audio/num-1.wav",
  two: "/audio/num-2.wav",
  three: "/audio/num-3.wav",
  four: "/audio/num-4.wav",
  five: "/audio/num-5.wav",
  six: "/audio/num-6.wav",
  seven: "/audio/num-7.wav",
  eight: "/audio/num-8.wav",
  nine: "/audio/num-9.wav",
  ten: "/audio/num-10.wav",
  eleven: "/audio/num-11.wav",
  twelve: "/audio/num-12.wav",
  thirteen: "/audio/num-13.wav",
  fourteen: "/audio/num-14.wav",
  fifteen: "/audio/num-15.wav",
  sixteen: "/audio/num-16.wav",
  seventeen: "/audio/num-17.wav",
  eighteen: "/audio/num-18.wav",
  nineteen: "/audio/num-19.wav",
  twenty: "/audio/num-20.wav",
  thirty: "/audio/num-21.wav",
  forty: "/audio/num-22.wav",
  fifty: "/audio/num-23.wav",
  sixty: "/audio/num-24.wav",
  seventy: "/audio/num-25.wav",
  eighty: "/audio/num-26.wav",
  ninety: "/audio/num-27.wav",
  hundred: "/audio/num-hundred.wav",
  thousand: "/audio/num-thousand.wav",
  lakh: "/audio/num-lakh.wav",
  rupees: "/audio/num-rupees.wav",
};

// Builds speakAnnouncement parts (see @/lib/tts) for a rupee amount. Only
// covers INR — a non-INR amount falls back to a live-spoken part, since the
// tile set is Indian-numbering-system specific.
export function amountToClipParts(amount, currency) {
  if (currency && currency !== "INR") {
    return [{ text: `${amount} ${currency}` }];
  }
  const words = [...amountToWords(amount), "rupees"];
  return words.map((w) => ({ clip: CLIP_MAP[w] })).filter((p) => p.clip);
}
