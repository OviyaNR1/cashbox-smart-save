import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { base44, supabase } from "@/api/base44Client";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { formatMoney } from "@/lib/currency";
import { getStartingAmount, calcAuctionOutcome } from "@/lib/liveAuctionEngine";
import { logAudit } from "@/lib/audit";
import { playStageChange, playGavel, playBidPlaced, CALL_TERMS, speakCallAnnouncement, markNamedBid } from "@/lib/sound";
import { speakAnnouncement, cancelAnnouncements } from "@/lib/tts";
import { announceAuctionStart, announceAuctionClosed, announceWinner, announceSignOff, announceNewLowestBid, announceNamedBid, announceSilence, shouldAnnounceBid } from "@/lib/auctionAnnouncements";
import { fireConfetti } from "@/lib/confetti";
import { sendWhatsAppMessage } from "@/lib/sendWhatsAppMessage";
import { useCountdown, CALL_DURATIONS } from "@/lib/useCountdown";
import { useStageChatter } from "@/lib/useStageChatter";
import { callStageStyle } from "@/lib/callStageStyle";
import { useElapsedTime } from "@/lib/useElapsedTime";
import { useLiveToasts } from "@/lib/useLiveToasts";
import { Gavel, Crown, Trophy, Building2, Radio, Eye } from "lucide-react";
import { useAdminCountry } from "@/lib/AdminCountryContext";
import AuctionPresenceChat from "@/components/auction/AuctionPresenceChat";
import LiveActivityToasts from "@/components/auction/LiveActivityToasts";
import { reachedFloor } from "@/lib/auctionFloor";

const CALL_LABELS = { call_1: "Call 1", call_2: "Call 2", final_call: "Final Call" };

export default function AdminLiveAuction() {
  const { country: countryFilter } = useAdminCountry();
  const [groups, setGroups] = useState([]);
  const [plans, setPlans] = useState([]);
  // Remembered across visits so the admin doesn't have to reselect the
  // group every time they open this page — same pattern as the other
  // cashbox_* admin preferences.
  const [groupId, setGroupId] = useState(() => localStorage.getItem("cashbox_live_auction_group") || "");
  const [auction, setAuction] = useState(null);
  const [bids, setBids] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // After Start Auction nothing else should need a click: once Final Call has
  // run out with at least one bid, the auction closes itself (winner is picked
  // server-side, the winner announcement and WhatsApp messages go out exactly
  // as with the manual Close). A short visible countdown and a Hold button
  // keep the admin in control.
  const [autoClose, setAutoClose] = useState(true);
  const [closingIn, setClosingIn] = useState(null);
  const [companyMonthRecorded, setCompanyMonthRecorded] = useState(false);
  const [me, setMe] = useState(null);
  const [watchingCount, setWatchingCount] = useState(0);
  const [bidFlash, setBidFlash] = useState(0);
  const { toasts, pushToast } = useLiveToasts();
  // Honest "how long this admin has been on this screen" — there's no
  // stored scheduled-start time before the Auction row is actually created.
  const [waitingSince] = useState(() => new Date().toISOString());
  const waitingElapsed = useElapsedTime(waitingSince);

  useEffect(() => {
    base44.entities.ChitPlan.list("-created_date", 200).then(setPlans);
    base44.entities.ChitGroup.list("-created_date", 200).then(setGroups);
    base44.auth.me().then(setMe).catch(() => {});
  }, []);

  useEffect(() => {
    if (groupId) localStorage.setItem("cashbox_live_auction_group", groupId);
  }, [groupId]);

  const liveAuctionGroups = useMemo(
    () => groups.filter((g) => {
      // Cancelled/completed groups (e.g. the hidden practice and demo groups) don't belong in the list.
      if (g.status !== "active") return false;
      const plan = plans.find((p) => p.id === g.plan_id);
      if (plan?.model !== "live_auction") return false;
      return ((plan.currency || "INR") === "CAD" ? "Canada" : "India") === countryFilter;
    }),
    [groups, plans, countryFilter]
  );

  const group = groups.find((g) => g.id === groupId);
  const plan = plans.find((p) => p.id === group?.plan_id);
  const currentMonth = group?.current_month || 1;
  // Month 1's company payout doesn't advance current_month anymore — the
  // group stays on Month 1 until the auction deciding Month 2 also closes
  // (bidding for it runs during Month 1 too). So "are we still waiting on
  // the company step" has to be tracked separately from current_month.
  const isCompanyMonth = currentMonth === 1 && !companyMonthRecorded;
  // The auction visible/actionable right now always decides the NEXT
  // month, not the current one — it's opened a month ahead so the
  // discounted rate is already known by the time that month is due.
  const targetMonth = currentMonth + 1;

  useEffect(() => {
    if (!group) {
      setCompanyMonthRecorded(false);
      return;
    }
    base44.entities.Winner.filter({ group_id: group.id, month_number: 1 }).then(
      (rows) => setCompanyMonthRecorded(rows.length > 0)
    );
  }, [group?.id]);

  const loadAuction = useCallback(async () => {
    if (!group || isCompanyMonth) {
      setAuction(null);
      setBids([]);
      return;
    }
    const rows = await base44.entities.Auction.filter({ group_id: group.id, month_number: targetMonth });
    const a = rows[0] || null;
    setAuction(a);
    if (a) {
      const b = await base44.entities.AuctionBid.filter({ auction_id: a.id });
      setBids(b);
      const profIds = [...new Set(b.map((x) => x.member_profile_id).filter(Boolean))];
      const profs = profIds.length
        ? await Promise.all(profIds.map((id) => base44.entities.MemberProfile.get(id)))
        : [];
      setProfiles(profs);
    } else {
      setBids([]);
    }
  }, [group, targetMonth, isCompanyMonth]);

  useEffect(() => { loadAuction(); }, [loadAuction]);

  // The postgres_changes callback below is only recreated when the auction
  // id changes, so it closes over whatever `bids`/`countdown` were at that
  // point — these refs stay current every render instead, so a bid
  // reaction can compare against the bid immediately before it rather than
  // stale data from when the channel first subscribed.
  const bidsRef = useRef([]);
  useEffect(() => { bidsRef.current = bids; }, [bids]);
  const countdownRef = useRef(null);

  useEffect(() => {
    if (!auction) return;
    const channel = supabase
      .channel(`admin-auction-${auction.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "auction_bids", filter: `auction_id=eq.${auction.id}` }, (payload) => {
        // Only a genuinely new, accepted bid gets the notification tone —
        // not a rejected attempt, and not the same row changing for some
        // other reason.
        if (payload.eventType === "INSERT" && payload.new?.status === "valid") {
          playBidPlaced();
          setBidFlash((n) => n + 1);
          // Fetched fresh rather than from local `profiles` state — a
          // first-time bidder in this auction wouldn't be in that list yet,
          // since it's only populated from bids loadAuction already knows
          // about, and this event can arrive before that re-fetch finishes.
          const bidderNameP = base44.entities.MemberProfile.get(payload.new.member_profile_id)
            .then((p) => p?.full_name || null)
            .catch(() => null);
          bidderNameP.then((name) => pushToast(`${name || "A member"} sent the lowest bid`, "bid"));
          // Throttled — a burst of bids only gets one excited reaction, not
          // one stacked announcement per bid.
          if (shouldAnnounceBid()) {
            const prevValidBids = bidsRef.current.filter((b) => b.status === "valid").sort((a, b) => a.amount - b.amount);
            const prevLowest = prevValidBids[0];
            const reaction = announceNewLowestBid(payload.new.amount, plan?.currency, {
              previousAmount: prevLowest ? prevLowest.amount : auction?.starting_amount,
              isFirstBid: !prevLowest,
              previousBidAt: prevLowest?.created_at,
              newBidAt: payload.new.created_at,
              countdownRemaining: countdownRef.current,
              minDecrement: auction?.min_decrement,
              minBid: plan?.auction_min_bid,
              startingAmount: auction?.starting_amount,
            });
            // Canada: a plain bid names the bidder and states the new amount in
            // one line (see LiveAuction.jsx); the Call 1 line after it stays
            // quiet, so the bid is marked before the name arrives to keep that
            // line from jumping the queue.
            const isCad = plan?.currency === "CAD";
            if (isCad && !reaction.special) {
              markNamedBid();
              bidderNameP.then((name) => {
                const named = announceNamedBid(name, Number(payload.new.amount), plan?.currency, {
                  sameBidder: prevValidBids.some((b) => b.member_profile_id === payload.new.member_profile_id),
                  atFloor: reachedFloor(Number(payload.new.amount), plan?.auction_min_bid, auction?.min_decrement),
                });
                if (named) {
                  speakAnnouncement(named.parts, { tag: "reaction", maxAgeMs: 6000 });
                } else {
                  // Name couldn't be fetched: the short reaction, then the usual
                  // Call 1 line (amount + question) after all.
                  speakAnnouncement(reaction.parts.slice(0, 1), { tag: "reaction", maxAgeMs: 4000 });
                  markNamedBid(0);
                  speakCallAnnouncement("call_1", Number(payload.new.amount), plan?.currency, false, auction.id);
                }
              });
            } else {
              speakAnnouncement(reaction.parts.slice(0, 1), { tag: "reaction", maxAgeMs: 4000 });
            }
          }
        }
        loadAuction();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "auctions", filter: `id=eq.${auction.id}` }, () => loadAuction())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [auction?.id, loadAuction]);

  const profileOf = (id) => profiles.find((p) => p.id === id);
  const validBids = bids.filter((b) => b.status === "valid").sort((a, b) => a.amount - b.amount);
  const rejectedBids = bids.filter((b) => b.status === "rejected");
  // At the plan's minimum nobody can bid lower: the final call is just the
  // count, then the auction closes (see useCountdown).
  const atFloorNow = reachedFloor(validBids[0]?.amount, plan?.auction_min_bid, auction?.min_decrement);
  const countdown = useCountdown(auction?.call_stage_started_at, auction?.status, plan?.currency, atFloorNow);
  useEffect(() => { countdownRef.current = countdown; }, [countdown]);
  const elapsed = useElapsedTime(auction?.status !== "closed" ? auction?.created_at : null);

  const startingAmount = plan ? getStartingAmount(plan) : 0;
  // What's actually being "called" right now — the current lowest bid, or
  // the starting ceiling if calling begins before anyone has bid.
  const calledAmount = validBids[0]?.amount ?? startingAmount;

  // Auto-advance the call sequence on its own timer instead of requiring a
  // manual button click for every stage — call 1 -> call 2 -> final call,
  // announcing "<amount> — Oru/Rendu/Moonu Tharam" as each begins. Stops at
  // final call: closing the auction stays a manual, confirmed action (see
  // closeAuction) since real bids can still be happening by phone/in person
  // alongside the app.
  // Navigating away mid-auction used to leave the queued voice lines (and
  // whatever clip was playing) running with nothing on screen to match.
  useEffect(() => () => cancelAnnouncements(), []);

  // While the room is open but Start hasn't been pressed (bidding_started_at is
  // null) nothing about the call sequence may run. The page still holds the
  // previous month's bids in memory right after a close, which made the effects
  // below think a bid had just landed and start Call 1 -> Call 2 -> Final Call
  // inside the empty lobby. Every call-sequence effect checks this.
  const biddingLive = !!auction?.bidding_started_at;

  // Longer than the server's bid window after Final Call (client clock + 2s
  // slack, see place_bid), so no late bid can slip in after the auto-close.
  const AUTO_CLOSE_GRACE_S = atFloorNow && plan?.currency !== "CAD" ? 1 : 5; // no bid is possible at the floor, so nothing to wait for
  const autoClosedRef = useRef(null);
  const closeAuctionRef = useRef(null);
  useEffect(() => {
    const ready =
      biddingLive && autoClose && auction && auction.status === "final_call" &&
      countdown === 0 && validBids.length > 0 && !busy && autoClosedRef.current !== auction.id;
    if (!ready) { setClosingIn(null); return undefined; }
    let left = AUTO_CLOSE_GRACE_S;
    setClosingIn(left);
    const id = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        clearInterval(id);
        setClosingIn(null);
        autoClosedRef.current = auction.id; // one attempt per auction, no retry loop
        closeAuctionRef.current?.();
      } else {
        setClosingIn(left);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [biddingLive, autoClose, auction?.id, auction?.status, countdown, validBids.length, busy]);

  const autoAdvancedKeyRef = useRef(null);
  useEffect(() => {
    if (!biddingLive || countdown === null || countdown > 0 || !auction) return;
    const stageKey = `${auction.id}-${auction.status}-${auction.call_stage_started_at}`;
    if (autoAdvancedKeyRef.current === stageKey) return;
    if (auction.status === "call_1") {
      autoAdvancedKeyRef.current = stageKey;
      advanceCall("call_2");
    } else if (auction.status === "call_2") {
      autoAdvancedKeyRef.current = stageKey;
      advanceCall("final_call");
    }
  }, [countdown, auction?.id, auction?.status, auction?.call_stage_started_at]);

  // A real auctioneer doesn't stay quiet while nobody bids — nudge the room
  // once at the stage's halfway point, and again (firmer) near the end if
  // it's STILL silent. final_call is excluded: its own oru/rendu/moone
  // dharam sequence already carries that job. A bid landing suppresses any
  // further nudge for that stage.
  const silenceStageRef = useRef({ key: null, tier: 0 });
  useEffect(() => {
    if (!biddingLive || countdown === null || !auction || !["call_1", "call_2"].includes(auction.status)) return;
    const half = Math.floor(CALL_DURATIONS[auction.status] / 2);
    const nearEnd = 8;
    const stageKey = `${auction.id}:${auction.status}:${auction.call_stage_started_at}`;
    if (silenceStageRef.current.key !== stageKey) silenceStageRef.current = { key: stageKey, tier: 0 };
    // "Nobody has bid" nudges only make sense while there is no leading bid
    // at all. A call stage now starts the moment a bid lands (which is
    // always a hair BEFORE the stage's own start time), so the old
    // "no bid since this stage began" check was always true and the room
    // got told "no bids yet" right on top of a leading bid — and doubled up
    // with the stage chatter below.
    const hasBidSinceStage = bids.some((b) => b.status === "valid");
    if (hasBidSinceStage) { silenceStageRef.current.tier = 2; return; }
    if (silenceStageRef.current.tier < 1 && countdown <= half) {
      silenceStageRef.current.tier = 1;
      speakAnnouncement(announceSilence("first", plan?.currency).parts, { tag: "nudge", maxAgeMs: 3000 });
    } else if (silenceStageRef.current.tier < 2 && countdown <= nearEnd) {
      silenceStageRef.current.tier = 2;
      speakAnnouncement(announceSilence("second", plan?.currency).parts, { tag: "nudge", maxAgeMs: 3000 });
    }
  }, [countdown, auction?.id, auction?.status, auction?.call_stage_started_at, bids]);

  useStageChatter(biddingLive ? auction : null, countdown, plan?.currency);

  // A real auctioneer starts calling the moment the first bid actually
  // comes in — not on a delay, and not waiting for the admin to notice and
  // click a button. Call 1 was the one stage that still needed a manual
  // click (call_1->call_2->final_call already auto-advance on their own
  // timer, see above); this closes that gap the same way bids themselves
  // already do: react to the leading bid changing, now including the
  // very first one.
  //
  // A new, lower bid mid-call means the price just being called is stale —
  // restart the count at "Oru Tharam" for the new lowest bid rather than
  // continuing call 2/final call for a price nobody's actually offering
  // anymore.
  const leadingBidIdRef = useRef(null);
  useEffect(() => {
    if (!auction || !biddingLive) { leadingBidIdRef.current = null; return; }
    const leadingId = validBids[0]?.id || null;
    const isFirstBidOnOpenFloor = auction.status === "open" && leadingId;
    const inCallStage = ["call_1", "call_2", "final_call"].includes(auction.status);
    const outbidMidCall = inCallStage && leadingBidIdRef.current && leadingId && leadingId !== leadingBidIdRef.current;
    if (isFirstBidOnOpenFloor || outbidMidCall) {
      // A bid that reaches the plan's minimum can't be undercut, so there is
      // nothing left to wait for: go straight to Final Call instead of
      // spending 50s of Call 1/Call 2 asking for bids nobody can place.
      const atFloorNow = reachedFloor(validBids[0].amount, plan?.auction_min_bid, auction.min_decrement);
      advanceCall(atFloorNow ? "final_call" : "call_1");
    }
    leadingBidIdRef.current = leadingId;
  }, [validBids[0]?.id, auction?.status]);

  const recordCompanyMonth = async () => {
    setBusy(true);
    const me = await base44.auth.me().catch(() => ({}));
    const created = await base44.entities.Winner.create({
      group_id: group.id,
      month_number: 1,
      member_profile_id: null,
      member_name: plan.company_label || "CashBox",
      prize_amount: plan.chit_amount,
      announcement_date: new Date().toISOString().slice(0, 10),
      approved_by: me.email || "admin",
      status: "announced",
      selection_method: "live_auction",
    });
    // Group stays on Month 1 — it only advances once the Month 2 auction
    // (started next, still within this same Month 1 sitting) closes.
    logAudit({ module: "Live Auction", action: "record-company-month", record_id: created.id, details: `Recorded Month 1 company allocation for group ${group.group_code}` });
    setBusy(false);
    setCompanyMonthRecorded(true);
  };

  // Two-step start. Step 1 opens the room: the auction row exists, so
  // members' screens switch over and they can join and chat, but
  // bidding_started_at stays NULL — nothing is spoken and place_bid refuses
  // bids. Step 2 (startBidding) is the only thing that starts the AI voice
  // and lets bids in, once the admin has given members time to join.
  const openRoom = async () => {
    setBusy(true);
    const created = await base44.entities.Auction.create({
      group_id: group.id,
      month_number: targetMonth,
      status: "open",
      starting_amount: startingAmount,
      min_decrement: plan.auction_min_decrement || 25,
      bidding_started_at: null,
    });
    logAudit({ module: "Live Auction", action: "open-room", record_id: created.id, details: `Opened the Month ${targetMonth} auction room for group ${group.group_code} (starting ${startingAmount})` });
    setBusy(false);
    loadAuction();
  };

  const startBidding = async () => {
    setBusy(true);
    await base44.entities.Auction.update(auction.id, { bidding_started_at: new Date().toISOString() });
    logAudit({ module: "Live Auction", action: "start", record_id: auction.id, details: `Started Month ${auction.month_number} auction for group ${group.group_code} (starting ${auction.starting_amount})` });
    const { parts, visual } = announceAuctionStart(auction.starting_amount, plan.currency);
    pushToast(visual, "default");
    cancelAnnouncements();
    speakAnnouncement(parts, { tag: "call", maxAgeMs: 8000 });
    setBusy(false);
    loadAuction();
  };

  // Backs out of an opened room before anything has started (opened by
  // mistake, or the session is postponed).
  const cancelRoom = async () => {
    setBusy(true);
    try {
      await base44.entities.Auction.delete(auction.id);
      logAudit({ module: "Live Auction", action: "cancel-room", record_id: auction.id, details: `Cancelled the Month ${auction.month_number} auction room for group ${group.group_code} before it started` });
    } catch (err) {
      alert(`Couldn't cancel the room: ${err.message || err}`);
    }
    setBusy(false);
    loadAuction();
  };

  const advanceCall = async (nextStatus) => {
    setBusy(true);
    await base44.entities.Auction.update(auction.id, { status: nextStatus, call_stage_started_at: new Date().toISOString() });
    logAudit({ module: "Live Auction", action: nextStatus, record_id: auction.id, details: `${CALL_LABELS[nextStatus]} (${CALL_TERMS[nextStatus]}) started for group ${group.group_code} at ${formatMoney(calledAmount, plan.currency)}` });
    playStageChange(nextStatus);
    const atFloor = reachedFloor(validBids[0]?.amount, plan.auction_min_bid, auction.min_decrement);
    speakCallAnnouncement(nextStatus, calledAmount, plan.currency, atFloor, auction.id);
    setBusy(false);
    loadAuction();
  };

  const closeAuction = async () => {
    setBusy(true);
    // Winner determination happens entirely server-side in this RPC — it
    // re-reads auction_bids itself under a row lock rather than trusting
    // this page's local `validBids` (which could theoretically be stale),
    // and writes the winner/dividend/auction/group rows in one transaction.
    // See close_live_auction() in the DB.
    const { data, error } = await supabase.rpc("close_live_auction", { p_auction_id: auction.id });
    if (error) {
      alert(`Couldn't close the auction: ${error.message}`);
      setBusy(false);
      return;
    }
    const result = data?.[0] || {};
    const winningAmount = result.out_winning_bid_amount;
    const winnerProfileId = result.out_winner_member_profile_id;
    const dividendPerMember = result.out_dividend_per_member;
    const nextInstallment = result.out_next_installment;
    const winnerProf = profileOf(winnerProfileId) || (await base44.entities.MemberProfile.get(winnerProfileId).catch(() => null));

    const memberships = await base44.entities.GroupMembership.filter({ group_id: group.id });
    const allActive = memberships.filter((m) => m.status === "active");
    const newCurrentMonth = Math.min(auction.month_number, plan.duration_months);

    // Send winner announcement messages automatically
    const monthLabel = `Month ${auction.month_number}`;
    const prizeAmountStr = `${plan?.currency || "INR"} ${winningAmount}`;
    const winnerName = winnerProf?.full_name || "Member";
    const dividendStr = formatMoney(dividendPerMember, plan.currency);
    const nextInstallmentStr = formatMoney(nextInstallment, plan.currency);

    const groupLabel = group.group_name || group.group_code;
    const memberProfiles = await Promise.all(allActive.map(m => base44.entities.MemberProfile.get(m.member_profile_id)));
    for (const prof of memberProfiles) {
      // Practice (trial) and demo groups never message anyone: the winner /
      // "next installment" templates read like a real payout and would confuse
      // members who are only practising.
      if (prof?.mobile && !group.is_demo) {
        const isWinner = prof.id === winnerProfileId;
        const template = isWinner ? "winner_announcement_winner_v5" : "winner_announcement_all_v5";
        const parameters = isWinner
          ? [winnerName, monthLabel, prizeAmountStr, dividendStr, nextInstallmentStr, groupLabel]
          : [winnerName, monthLabel, prizeAmountStr, dividendStr, nextInstallmentStr];
        try {
          await sendWhatsAppMessage({
            phone: prof.mobile,
            templateName: template,
            parameters,
          });
        } catch (err) {
          console.error(`Failed to send ${template} to ${prof.full_name}:`, err);
        }
      }
    }

    playGavel();
    fireConfetti();
    const closedLine = announceAuctionClosed(plan.currency);
    pushToast(closedLine.visual, "default");
    // Everything still queued or playing (call clips, chatter, a final-call
    // count mid-sentence) is about an auction that no longer exists — cut it
    // so the closing sequence is the next thing heard, not the end of a
    // backlog. The closing lines themselves must never be dropped for age.
    cancelAnnouncements();
    const closing = { tag: "closing", maxAgeMs: Infinity };
    speakAnnouncement(closedLine.parts, closing);
    setTimeout(() => {
      const winnerLine = announceWinner(winnerProf?.full_name || "Member", winningAmount, plan.currency);
      pushToast(winnerLine.visual, "bid");
      speakAnnouncement(winnerLine.parts, closing);
      // A closing sign-off once the winner's named, so the room doesn't
      // just go silent — speakAnnouncement's own shared queue means this
      // naturally waits for the winner line to finish first.
      speakAnnouncement(announceSignOff(plan.currency).parts, closing);
    }, 1800);
    setBusy(false);
    setCloseConfirmOpen(false);
    setGroups((gs) => gs.map((g) => (g.id === group.id ? { ...g, current_month: newCurrentMonth } : g)));
    loadAuction();
  };

  closeAuctionRef.current = closeAuction;

  return (
    <div className="space-y-6">
      <LiveActivityToasts toasts={toasts} />
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-primary">Admin</p>
        <h1 className="text-3xl font-semibold text-foreground mt-1">Live Auction</h1>
      </div>

      <div className="bg-card rounded-2xl border border-border p-4 flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium text-muted-foreground">Group:</span>
        <Select value={groupId} onValueChange={setGroupId}>
          <SelectTrigger className="w-full sm:w-96"><SelectValue placeholder="Choose a live auction group" /></SelectTrigger>
          <SelectContent>
            {liveAuctionGroups.map((g) => (
              <SelectItem key={g.id} value={g.id}>{g.group_name || g.group_code} — {plans.find((p) => p.id === g.plan_id)?.plan_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!groupId && (
        <div className="bg-card rounded-2xl border border-border p-12 text-center text-sm text-muted-foreground">
          {liveAuctionGroups.length === 0
            ? "No Live Auction groups yet. Create a group linked to a Live Auction plan first."
            : "Select a group to manage its auction."}
        </div>
      )}

      {groupId && plan && isCompanyMonth && (
        <div className="bg-card rounded-2xl border border-border p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm font-medium text-foreground flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" /> Month 1 — {plan.company_label || "CashBox"} receives this month's allocation ({formatMoney(plan.chit_amount, plan.currency)}), no bidding.
            </p>
            <Button onClick={recordCompanyMonth} disabled={busy} className="bg-primary hover:bg-primary/90 rounded-full">
              {busy ? "Recording…" : "Record company month"}
            </Button>
          </div>
        </div>
      )}

      {groupId && plan && !isCompanyMonth && !auction && (
        <div className="bg-card rounded-2xl border border-border p-8 text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            Deciding Month {targetMonth} of {plan.duration_months} (currently in Month {currentMonth}) · Starting amount {formatMoney(startingAmount, plan.currency)} · Minimum decrement {formatMoney(plan.auction_min_decrement, plan.currency)}
          </p>
          <p className="flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground tabular-nums">
            <Radio className="w-3 h-3 animate-pulse text-rose-400" /> Waiting {waitingElapsed}
          </p>
          {watchingCount > 0 && (
            <p className="flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Eye className="w-3.5 h-3.5" /> {watchingCount} member{watchingCount === 1 ? "" : "s"} already waiting in the room
            </p>
          )}
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Opening the room lets members join and chat. Nothing is spoken and no bids are accepted until you press Start Auction.
          </p>
          <Button onClick={openRoom} disabled={busy} className="bg-primary hover:bg-primary/90 rounded-full">
            <Gavel className="w-4 h-4 mr-1" /> {busy ? "Opening…" : `Open Auction Room for Month ${targetMonth}`}
          </Button>
        </div>
      )}

      {groupId && plan && !isCompanyMonth && auction && auction.status !== "closed" && !auction.bidding_started_at && (
        <div className="bg-card rounded-2xl border border-border p-8 text-center space-y-4">
          <p className="text-sm font-semibold text-foreground">Month {auction.month_number} room is open</p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Members can join and chat now. When you press Start Auction the AI voice begins and bidding opens at {formatMoney(auction.starting_amount, plan.currency)}.
          </p>
          <p className="flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Eye className="w-3.5 h-3.5" /> {watchingCount} member{watchingCount === 1 ? "" : "s"} in the room
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Button onClick={startBidding} disabled={busy} className="bg-primary hover:bg-primary/90 rounded-full">
              <Gavel className="w-4 h-4 mr-1" /> {busy ? "Starting…" : "Start Auction"}
            </Button>
            <Button variant="outline" onClick={cancelRoom} disabled={busy} className="rounded-full">Cancel room</Button>
          </div>
        </div>
      )}

      {groupId && plan && !isCompanyMonth && auction && auction.status === "closed" && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6 space-y-2">
          <p className="text-sm font-semibold text-emerald-400 flex items-center gap-2"><Trophy className="w-4 h-4" /> Month {auction.month_number} closed</p>
          <p className="text-sm text-foreground">Winner: {profileOf(auction.winner_member_profile_id)?.full_name || "Member"} — {formatMoney(auction.winning_bid_amount, plan.currency)}</p>
          <p className="text-xs text-muted-foreground">Group has advanced to month {group.current_month}. Select the group again or refresh to manage the next month.</p>
        </div>
      )}

      {groupId && plan && !isCompanyMonth && (
        <AuctionPresenceChat
          auctionId={auction?.id || null}
          groupId={group.id}
          monthNumber={targetMonth}
          userId={me?.id}
          memberProfileId={null}
          // base44.auth.me() never actually returns a full_name (the
          // `profiles` table has no such column), so this used to silently
          // fall through to the admin's raw email address and show that to
          // every member in the "Live now" panel. Admins have no stored
          // display name, so show a fixed generic label instead of leaking it.
          senderName="Admin"
          onJoin={(name) => pushToast(`${name} joined`, "join")}
          onPresenceChange={setWatchingCount}
        />
      )}

      {groupId && plan && !isCompanyMonth && auction && auction.status !== "closed" && auction.bidding_started_at && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 text-xs font-medium tabular-nums">
              <Radio className="w-3 h-3 animate-pulse" /> LIVE {elapsed}
            </span>
            {watchingCount > 0 && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-foreground text-xs font-medium">
                <Eye className="w-3 h-3" /> {watchingCount} watching
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Auction Month" value={`${auction.month_number}/${plan.duration_months}`} />
            <StatCard label="Auction Status" value={auction.status.replace("_", " ")} />
            <StatCard label="Lowest Bid" value={validBids[0] ? formatMoney(validBids[0].amount, plan.currency) : "—"} />
            <StatCard label="Total Bids" value={bids.length} />
          </div>

          {countdown !== null && (() => {
            // final_call's own 30s clock (see useCountdown) -- once it hits
            // 0, place_bid() itself starts rejecting new bids server-side.
            if (auction.status === "final_call" && countdown === 0) {
              return (
                <div className="rounded-2xl p-6 text-center border bg-rose-500/10 border-rose-500/25">
                  <p className="text-sm font-semibold text-rose-400">🔒 Bidding closed</p>
                  <p className="text-xs text-muted-foreground mt-1">Final call has ended — close the auction to confirm the winner.</p>
                </div>
              );
            }
            const look = callStageStyle(auction.status, countdown);
            return (
              <div
                key={auction.status}
                className={`rounded-2xl p-6 text-center border transition-colors ${look.card}`}
              >
                <p className={`text-sm font-semibold mb-1 tracking-wide ${look.label}`}>
                  {look.icon} {formatMoney(calledAmount, plan.currency)} — {CALL_TERMS[auction.status]}
                </p>
                <p className={`font-bold text-foreground tabular-nums transition-all ${look.number}`}>{countdown}</p>
                {look.hint && !atFloorNow && <p className="text-xs text-rose-300 mt-1">{look.hint}</p>}
                {atFloorNow && (
                  <p className="text-xs text-emerald-300 mt-2">
                    Minimum bid reached — no lower bid is possible. Final count, then the auction closes and the winner is announced automatically.
                  </p>
                )}
              </div>
            );
          })()}

          {closingIn !== null && (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm font-medium text-amber-200">{atFloorNow ? "Minimum bid reached — closing the auction and announcing the winner in" : "Final call is over — closing the auction automatically in"} {closingIn}s</p>
              <Button variant="outline" onClick={() => setAutoClose(false)} className="rounded-full">Hold — I'll close it myself</Button>
            </div>
          )}

          <div className="bg-card rounded-2xl border border-border p-5">
            <p className="text-sm font-medium text-foreground flex items-center gap-2 mb-4"><Crown className="w-4 h-4 text-primary" /> Leaderboard</p>
            {validBids.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No bids yet.</p>
            ) : (
              <div className="space-y-2">
                {/* Top row's key includes bidFlash so the flash animation
                    replays every time the #1 spot changes, not just once. */}
                {validBids.map((b, i) => (
                  <div
                    key={i === 0 ? `${b.id}-${bidFlash}` : b.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border border-border ${i === 0 ? "animate-in fade-in zoom-in-95 duration-500" : ""}`}>
                    <span className="w-8 text-center">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{profileOf(b.member_profile_id)?.full_name || "Member"}</p>
                      <p className="text-xs font-medium text-foreground/80 tabular-nums">
                        {new Date(b.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </p>
                    </div>
                    <p className="font-semibold tabular-nums text-foreground">{formatMoney(b.amount, plan.currency)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {rejectedBids.length > 0 && (
            <div className="bg-card rounded-2xl border border-border p-5">
              <p className="text-sm font-medium text-foreground mb-3">Rejected bid attempts</p>
              <div className="space-y-1 text-xs text-muted-foreground">
                {rejectedBids.map((b) => (
                  <p key={b.id}>
                    <span className="font-medium tabular-nums text-foreground/80">
                      {new Date(b.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>{" "}
                    — {profileOf(b.member_profile_id)?.full_name || "Member"} — {formatMoney(b.amount, plan.currency)} — {b.rejection_reason}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Call 1 and Call 2 are no longer buttons here — they start on
              their own the moment a bid lands, and advance on their own
              timer from there (see the effects above). Final Call and
              closing the auction stay the only two manual, admin-confirmed
              actions: skipping straight to final call is a deliberate call
              an admin can still make at any point bidding is active, but
              nothing before that should need a click at all. */}
          <div className="bg-card rounded-2xl border border-border p-5 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none w-full">
              <input type="checkbox" checked={autoClose} onChange={(e) => setAutoClose(e.target.checked)} className="w-4 h-4 accent-primary" />
              Close automatically after Final Call ends (winner announced for you)
            </label>
            <Button
              variant="outline"
              onClick={() => advanceCall("final_call")}
              disabled={busy || !["open", "call_1", "call_2"].includes(auction.status) || validBids.length === 0}
              className="rounded-full"
            >
              Final Call
            </Button>
            <Button onClick={() => setCloseConfirmOpen(true)} disabled={busy || validBids.length === 0} className="bg-destructive hover:bg-destructive/90 rounded-full ml-auto">
              Close Auction
            </Button>
          </div>
        </>
      )}

      <Dialog open={closeConfirmOpen} onOpenChange={setCloseConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Close auction?</DialogTitle></DialogHeader>
          {validBids[0] && plan && (() => {
            const outcome = calcAuctionOutcome({ plan, winningBid: validBids[0].amount });
            return (
              <div className="space-y-2 text-sm py-2">
                <p className="text-muted-foreground">Are all members satisfied?</p>
                <div className="bg-muted/40 rounded-xl p-4 space-y-1">
                  <p>Winner: <span className="font-semibold text-foreground">{profileOf(validBids[0].member_profile_id)?.full_name || "Member"}</span></p>
                  <p>Winning bid: <span className="font-semibold text-foreground">{formatMoney(validBids[0].amount, plan.currency)}</span></p>
                  <p>Dividend/member: <span className="font-semibold text-foreground">{formatMoney(outcome.dividendPerMember, plan.currency)}</span></p>
                  <p>Next installment: <span className="font-semibold text-foreground">{formatMoney(outcome.nextInstallment, plan.currency)}</span></p>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseConfirmOpen(false)} className="rounded-full">No</Button>
            <Button onClick={closeAuction} disabled={busy} className="bg-primary hover:bg-primary/90 rounded-full">{busy ? "Closing…" : "Yes, close"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-5">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground capitalize">{value}</p>
    </div>
  );
}
