import confetti from "canvas-confetti";

const BRAND_COLORS = ["#FFB833", "#F7F3EC", "#22c55e"];

// Standard burst — used when an auction closes for everyone watching.
export function fireConfetti() {
  confetti({ particleCount: 90, spread: 75, origin: { y: 0.6 }, colors: BRAND_COLORS });
}

// Bigger, longer celebration — reserved for the winning member's screen.
export function fireWinnerConfetti() {
  const end = Date.now() + 1200;
  (function frame() {
    confetti({ particleCount: 4, angle: 60, spread: 55, origin: { x: 0 }, colors: BRAND_COLORS });
    confetti({ particleCount: 4, angle: 120, spread: 55, origin: { x: 1 }, colors: BRAND_COLORS });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
  confetti({ particleCount: 160, spread: 100, origin: { y: 0.5 }, colors: BRAND_COLORS });
}
