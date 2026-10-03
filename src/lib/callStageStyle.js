// Look of the countdown card for each call stage. Before, the card only
// reacted to the seconds left, so moving from Call 1 to Call 2 to Final Call
// looked almost identical and was easy to miss. Each stage now has its own
// colour and number size, Final Call pulses for its whole length, and the
// card is re-keyed by stage so it pops in when the stage changes.
export function callStageStyle(status, countdown) {
  const closing = countdown !== null && countdown <= 10;
  if (status === "final_call") {
    return {
      card: "bg-rose-600/25 border-rose-500/70 animate-pulse",
      label: "text-rose-300",
      number: "text-7xl",
      icon: "🔥",
      hint: "Last chance — bid now!",
    };
  }
  if (status === "call_2") {
    return {
      card: closing ? "bg-orange-500/20 border-orange-500/50 animate-pulse" : "bg-orange-500/15 border-orange-500/40",
      label: "text-orange-300",
      number: "text-6xl",
      icon: "🔔",
      hint: closing ? "Final call is next!" : null,
    };
  }
  return {
    card: closing ? "bg-rose-500/20 border-rose-500/40 animate-pulse" : "bg-amber-500/10 border-amber-500/20",
    label: closing ? "text-rose-400" : "text-amber-400",
    number: closing ? "text-6xl" : "text-5xl",
    icon: "⚠️",
    hint: null,
  };
}
