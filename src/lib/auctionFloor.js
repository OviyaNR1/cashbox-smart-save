// True once the current lowest bid can't be undercut: the next valid bid
// (lowest minus the minimum decrement) would fall under the plan's minimum
// allowed bid. At that point there is nothing left to ask the room for —
// the bid box, the "any lower?" call lines and the Call 1/Call 2 waiting
// all stop making sense. Plans without a minimum bid (auction_min_bid unset
// or 0) never reach a floor.
export function reachedFloor(lowestAmount, minBid, minDecrement) {
  if (lowestAmount == null || !(minBid > 0)) return false;
  return lowestAmount - (minDecrement || 0) < minBid;
}
