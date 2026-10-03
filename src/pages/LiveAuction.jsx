import React, { useEffect, useState, useCallback, useRef } from "react";
import { base44, supabase } from "@/api/base44Client";
import { formatMoney } from "@/lib/currency";
import { calcAuctionOutcome } from "@/lib/liveAuctionEngine";
import { playStageChange, playFanfare, playGavel, playBidPlaced, CALL_TERMS, speakCallAnnouncement } from "@/lib/sound";
import { fireConfetti, fireWinnerConfetti } from "@/lib/confetti";
import { useCountdown, CALL_DURATIONS } from "@/lib/useCountdown";
import { useStageChatter } from "@/lib/useStageChatter";
import { useElapsedTime } from "@/lib/useElapsedTime";
import { useLiveToasts } from "@/lib/useLiveToasts";
import { logAudit } from "@/lib/audit";
import { speakAnnouncement, cancelAnnouncements } from "@/lib/tts";
import { announceAuctionStart, announceAuctionClosed, announceWinner, announceSignOff, announceNewLowestBid, announceSilence, shouldAnnounceBid } from "@/lib/auctionAnnouncements";
import { Crown, Gavel, Building2, Trophy, Radio } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import AuctionPresenceChat from "@/components/auction/AuctionPresenceChat";
import SoundUnlockBanner from "@/components/auction/SoundUnlockBanner";
import LiveActivityToasts from "@/components/auction/LiveActivityToasts";
import { reachedFloor } from "@/lib/auctionFloor";
import { callStageStyle } from "@/lib/callStageStyle";

// place_bid()'s rejection_reason is written for the audit log, not for a
// member reading it mid-auction — translate the handful of fixed strings it
// can return into plain language with an actual next step, rather than
// showing the raw database wording.
function friendlyBidRejection(reason, auction, plan) {
  switch (reason) {
    case "You are not a member of this group":
      return "You're not part of this group, so you can't bid here.";
    case "Member suspended":
      return "Your membership is currently paused. Contact your group admin to find out why.";
    case "Payment overdue":
      return "You have an unpaid installment. Pay it first, then you'll be able to bid.";
    case "Member already won":
      return "You've already won a previous month in this group, so you can't bid again.";
    case "Auction Closed":
      return "This auction has already closed. Wait for next month's auction to open.";
    case "Final call has ended":
      return "Final call has ended — bidding is locked. Waiting for the admin to close the auction.";
    case "Duplicate bid":
      return "Someone already bid that exact amount. Try a lower number.";
    case "Already the lowest bidder":
      return "You're already the current lowest bidder — wait for someone else to bid before you can bid again.";
    case "Bid higher than current lowest":
      return "Your bid needs to be lower than the current amount shown. Try a smaller number.";
    case "Bid below minimum decrement":
      return auction?.min_decrement
        ? `Your bid needs to be at least ${auction.min_decrement} lower than the current amount. Try a smaller number.`
        : "Your bid isn't low enough compared to the current amount. Try a smaller number.";
    case "Bid below minimum allowed":
      return plan?.auction_min_bid
        ? `Bids can't go below ${formatMoney(plan.auction_min_bid, plan.currency)} for this plan. Try a higher number.`
        : "That bid is below the minimum allowed for this plan. Try a higher number.";
    default:
      return reason || "Your bid couldn't be placed. Please try again.";
  }
}

export default function LiveAuction() {
  const [state, setState] = useState({ loading: true });
  // No stored "scheduled start" exists before the admin actually creates the
  // Auction row, so this is honestly "how long you've personally been
  // waiting" (from when this page mounted) rather than a shared countdown
  // to a specific time.
  const [waitingSince] = useState(() => new Date().toISOString());
  const waitingElapsed = useElapsedTime(waitingSince);
  const [bidAmount, setBidAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [confirmingBid, setConfirmingBid] = useState(false);
  const prevStatusRef = useRef(null);
  const startAnnouncedRef = useRef(new Set());
  // Leaving the room mid-auction used to leave queued voice lines (and the
  // clip already playing) running with nothing on screen to match.
  useEffect(() => () => cancelAnnouncements(), []);
  const joinLoggedRef = useRef(new Set());
  const [bidFlash, setBidFlash] = useState(0);
  const { toasts, pushToast } = useLiveToasts();

  const load = useCallback(async () => {
    try {
      const me = await base44.auth.me();
      const memberships = await base44.entities.GroupMembership.filter({ user_id: me.id });
      const groupIds = memberships.map((m) => m.group_id);
      const [groups, plans] = await Promise.all([
        groupIds.length ? base44.entities.ChitGroup.list("-created_date", 200) : Promise.resolve([]),
        base44.entities.ChitPlan.list("-created_date", 200),
      ]);

      const liveGroups = groups.filter(
        (g) => groupIds.includes(g.id) && plans.find((p) => p.id === g.plan_id)?.model === "live_auction"
      );

      // For each group, find its most recent auction (any status), in
      // parallel rather than one network round-trip per group. Prefer a
      // group with an in-progress auction; if none are in progress, fall
      // back to the most recently closed one so members can see what just
      // happened.
      const candidates = (
        await Promise.all(
          liveGroups.map(async (g) => {
            const rows = await base44.entities.Auction.filter({ group_id: g.id }, "-month_number", 1);
            const latest = rows[0];
            return latest ? { auction: latest, group: g, plan: plans.find((p) => p.id === g.plan_id) } : null;
          })
        )
      ).filter(Boolean);
      const openPick = candidates.find((c) => c.auction.status !== "closed");
      const closedPick = candidates
        .filter((c) => c.auction.status === "closed")
        .sort((a, b) => new Date(b.auction.closed_at) - new Date(a.auction.closed_at))[0];
      const picked = openPick || closedPick;
      const auction = picked?.auction || null;
      // No Auction row exists yet for any candidate group (e.g. the admin
      // hasn't clicked Start Auction this month) — fall back to the first
      // live-auction group this member belongs to anyway, so the waiting
      // room (chat + presence) still has somewhere to attach to instead of
      // showing a dead end. monthNumber is what WOULD be the next auction's
      // month, used to key the chat room before that auction actually exists.
      const group = picked?.group || liveGroups[0] || null;
      const plan = picked?.plan || (group ? plans.find((p) => p.id === group.plan_id) : null);
      const monthNumber = auction?.month_number ?? (group ? (group.current_month || 1) + 1 : null);
      // A person can hold multiple tickets (memberships) in the same
      // group — picking an arbitrary one here could show "you've already
      // won, bidding closed" for someone who actually still has a
      // different, eligible ticket. Prefer whichever of their tickets is
      // actually eligible to bid (active, unwon, not overdue), mirroring
      // place_bid()'s own resolution, so this page's bid-eligibility gate
      // never disagrees with what the RPC will actually allow.
      const myGroupMemberships = group ? memberships.filter((m) => m.group_id === group.id) : [];
      const myMembership =
        myGroupMemberships.find(
          (m) => m.status === "active" && !m.has_won && (m.paid_installments || 0) >= (group?.current_month || 1) - 1
        ) || myGroupMemberships[0] || null;

      let bids = [];
      let profiles = [];
      if (auction) {
        bids = await base44.entities.AuctionBid.filter({ auction_id: auction.id });
        const profIds = [...new Set(bids.map((b) => b.member_profile_id).filter(Boolean))];
        // Members can only SELECT their own member_profiles row under RLS —
        // fetching another bidder's profile via .get() throws a "cannot
        // coerce to a single JSON object" error (0 rows, not really
        // missing). This RPC is SECURITY DEFINER and returns only id +
        // full_name, so it's safe to call for any bidder without exposing
        // their bank/KYC/guarantor details.
        if (profIds.length) {
          const { data, error } = await supabase.rpc("get_member_names", { ids: profIds });
          if (error) throw error;
          profiles = data || [];
        }
      }

      // Members can only SELECT their own member_profiles row under RLS, so
      // this direct .get() (not the bidder-only get_member_names RPC) is
      // the only way to reliably get the viewer's own display name — they
      // might not have bid yet, so they wouldn't be in `profiles` above.
      const myProfile = myMembership
        ? await base44.entities.MemberProfile.get(myMembership.member_profile_id).catch(() => null)
        : null;

      setState({ loading: false, me, auction, group, plan, monthNumber, myMembership, myName: myProfile?.full_name || "Member", bids, profiles });
    } catch (err) {
      setState({ loading: false, error: err.message || String(err) });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // The postgres_changes callback below is only recreated when the auction
  // id changes, so it closes over whatever `state`/`countdown` were at that
  // point — these refs stay current every render instead, so a bid
  // reaction can compare against the bid immediately before it rather than
  // stale data from when the channel first subscribed.
  const bidsRef = useRef([]);
  useEffect(() => { bidsRef.current = state.bids || []; }, [state.bids]);

  useEffect(() => {
    if (!state.auction) return;
    const channel = supabase
      .channel(`member-auction-${state.auction.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "auction_bids", filter: `auction_id=eq.${state.auction.id}` }, (payload) => {
        if (payload.eventType === "INSERT" && payload.new?.status === "valid") {
          playBidPlaced();
          setBidFlash((n) => n + 1);
          const bidderName = payload.new.member_profile_id === state.myMembership?.member_profile_id
            ? state.myName
            : state.profiles?.find((p) => p.id === payload.new.member_profile_id)?.full_name;
          pushToast(`${bidderName || "A member"} sent the lowest bid`, "bid");
          // Throttled — a burst of bids only gets one excited reaction, not
          // one stacked announcement per bid.
          if (shouldAnnounceBid()) {
            const prevValidBids = bidsRef.current.filter((b) => b.status === "valid").sort((a, b) => a.amount - b.amount);
            const prevLowest = prevValidBids[0];
            speakAnnouncement(announceNewLowestBid(payload.new.amount, state.plan?.currency, {
              previousAmount: prevLowest ? prevLowest.amount : state.auction?.starting_amount,
              isFirstBid: !prevLowest,
              previousBidAt: prevLowest?.created_at,
              newBidAt: payload.new.created_at,
              countdownRemaining: countdownRef.current,
              minDecrement: state.auction?.min_decrement,
              minBid: state.plan?.auction_min_bid,
              startingAmount: state.auction?.starting_amount,
            // Just the short reaction clip, same as the admin screen: a new
            // lowest bid always restarts the call, whose own line states the
            // amount — saying it here too put it twice back to back.
            }).parts.slice(0, 1), { tag: "reaction", maxAgeMs: 4000 });
          }
        }
        load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "auctions", filter: `id=eq.${state.auction.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [state.auction?.id, load]);

  // The channel above only watches the auction that was loaded when the page
  // opened. A member already sitting on last month's result (or the waiting
  // room) never heard about the NEXT auction starting and needed a manual
  // refresh — missing the opening and the first bids. Watch the group for new
  // auctions and reload when one is created.
  const watchedGroupId = state.group?.id;
  useEffect(() => {
    if (!watchedGroupId) return;
    const channel = supabase
      .channel(`member-group-auctions-${watchedGroupId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "auctions", filter: `group_id=eq.${watchedGroupId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [watchedGroupId, load]);

  const countdown = useCountdown(state.auction?.call_stage_started_at, state.auction?.status, state.plan?.currency);
  const countdownRef = useRef(null);
  useEffect(() => { countdownRef.current = countdown; }, [countdown]);
  const elapsed = useElapsedTime(state.auction?.status !== "closed" ? state.auction?.created_at : null);

  useStageChatter(state.auction, countdown, state.plan?.currency);

  // The opening line ("ready ah? start panniralaama…") was only ever played
  // by the admin's screen. Members on their own phones heard nothing until
  // the first bid, so the room's own device says it too the moment the admin
  // presses Start Auction (bidding_started_at gets set). Once per auction, and
  // only if it just started — someone joining a half-finished auction, or
  // sitting in the lobby, shouldn't hear it.
  useEffect(() => {
    const auction = state.auction;
    if (!auction || auction.status !== "open" || !auction.bidding_started_at || startAnnouncedRef.current.has(auction.id)) return;
    if ((state.bids || []).some((b) => b.status === "valid")) return;
    const startedAgo = Date.now() - new Date(auction.bidding_started_at).getTime();
    if (startedAgo > 20000) return;
    startAnnouncedRef.current.add(auction.id);
    const { parts } = announceAuctionStart(auction.starting_amount, state.plan?.currency);
    speakAnnouncement(parts, { tag: "opening", maxAgeMs: 8000 });
  }, [state.auction, state.bids, state.plan?.currency]);

  // A real auctioneer doesn't stay quiet while nobody bids — nudge the room
  // once at the stage's halfway point, and again (firmer) near the end if
  // it's STILL silent. final_call is excluded: its own oru/rendu/moone
  // dharam sequence already carries that job. Tracked per stage (keyed on
  // its own start time) so a genuinely new stage can nudge again, but a
  // re-render mid-stage never re-fires the same tier, and a bid landing
  // suppresses any further nudge for that stage.
  const silenceStageRef = useRef({ key: null, tier: 0 });
  useEffect(() => {
    const auction = state.auction;
    if (!auction || countdown === null || !["call_1", "call_2"].includes(auction.status)) return;
    const half = Math.floor(CALL_DURATIONS[auction.status] / 2);
    const nearEnd = 8;
    const stageKey = `${auction.id}:${auction.status}:${auction.call_stage_started_at}`;
    if (silenceStageRef.current.key !== stageKey) silenceStageRef.current = { key: stageKey, tier: 0 };
    // Only while nobody has a leading bid at all — see AdminLiveAuction.jsx.
    const hasBidSinceStage = (state.bids || []).some((b) => b.status === "valid");
    if (hasBidSinceStage) { silenceStageRef.current.tier = 2; return; }
    if (silenceStageRef.current.tier < 1 && countdown <= half) {
      silenceStageRef.current.tier = 1;
      speakAnnouncement(announceSilence("first", state.plan?.currency).parts, { tag: "nudge", maxAgeMs: 3000 });
    } else if (silenceStageRef.current.tier < 2 && countdown <= nearEnd) {
      silenceStageRef.current.tier = 2;
      speakAnnouncement(announceSilence("second", state.plan?.currency).parts, { tag: "nudge", maxAgeMs: 3000 });
    }
  }, [countdown, state.auction, state.bids]);

  useEffect(() => {
    const { auction, group, myMembership } = state;
    if (!auction || auction.status === "closed" || !myMembership) return;
    if (joinLoggedRef.current.has(auction.id)) return;
    joinLoggedRef.current.add(auction.id);
    base44.entities.MemberProfile.get(myMembership.member_profile_id)
      .then((prof) => {
        logAudit({
          module: "Live Auction",
          action: "join",
          record_id: auction.id,
          details: `${prof?.full_name || "A member"} joined the Month ${auction.month_number} auction for group ${group?.group_code || ""} at ${new Date().toLocaleString()}`,
        });
      })
      .catch(() => {});
  }, [state]);

  useEffect(() => {
    const auction = state.auction;
    if (!auction) return;
    const prev = prevStatusRef.current;
    if (prev !== null && prev !== auction.status) {
      if (["call_1", "call_2", "final_call"].includes(auction.status)) {
        // Call 1 only ever starts because a bid just landed, and that bid
        // already beeped (playBidPlaced). The bell a beat later — after this
        // screen reloads the auction — made it "beep, beep" on phones. The
        // bell stays for the timer-driven Call 2 / Final Call.
        if (auction.status !== "call_1") playStageChange(auction.status);
        const validBidsNow = (state.bids || []).filter((b) => b.status === "valid").sort((a, b) => a.amount - b.amount);
        const calledAmount = validBidsNow[0]?.amount ?? auction.starting_amount;
        const atFloor = reachedFloor(validBidsNow[0]?.amount, state.plan?.auction_min_bid, auction.min_decrement);
        speakCallAnnouncement(auction.status, calledAmount, state.plan?.currency, atFloor, auction.id);
      } else if (auction.status === "closed") {
        const iWon = state.myMembership && auction.winner_member_profile_id === state.myMembership.member_profile_id;
        const winnerName = state.profiles?.find((p) => p.id === auction.winner_member_profile_id)?.full_name || "Member";
        const closedLine = announceAuctionClosed(state.plan?.currency);
        pushToast(closedLine.visual, "default");
        // Cut every call/chatter/count line still queued or playing — they
        // describe an auction that's over — then play the closing sequence,
        // which must never be dropped for age.
        cancelAnnouncements();
        const closing = { tag: "closing", maxAgeMs: Infinity };
        speakAnnouncement(closedLine.parts, closing);
        // A brief pause before the reveal, same beat as a real auctioneer.
        setTimeout(() => {
          const winnerLine = announceWinner(iWon ? "You" : winnerName, auction.winning_bid_amount, state.plan?.currency);
          pushToast(winnerLine.visual, iWon ? "bid" : "default");
          speakAnnouncement(winnerLine.parts, closing);
          // A closing sign-off once the winner's named, so the room doesn't
          // just go silent — speakAnnouncement's own shared queue means
          // this naturally waits for the winner line to finish first.
          speakAnnouncement(announceSignOff(state.plan?.currency).parts, closing);
        }, 1800);
        if (iWon) {
          playFanfare();
          fireWinnerConfetti();
        } else {
          playGavel();
          fireConfetti();
        }
      }
    }
    prevStatusRef.current = auction.status;
  }, [state.auction, state.myMembership]);

  // A mistyped digit under the countdown pressure locks in a real bid with
  // no undo — the first click asks for confirmation instead of submitting
  // immediately; only the second click (on the now-"Confirm" button) sends
  // it. Any further edit to the amount cancels the pending confirmation, so
  // it can't accidentally carry over onto a different number.
  const onBidButtonClick = () => {
    if (!bidAmount || !state.auction) return;
    if (!confirmingBid) {
      setConfirmingBid(true);
      return;
    }
    submitBid();
  };

  const submitBid = async () => {
    setConfirmingBid(false);
    setSubmitting(true);
    setFeedback(null);
    const { data, error } = await supabase.rpc("place_bid", {
      p_auction_id: state.auction.id,
      p_amount: Number(bidAmount),
    });
    setSubmitting(false);
    if (error) {
      setFeedback({ ok: false, message: friendlyBidRejection(error.message, state.auction, state.plan) });
      return;
    }
    if (data?.status === "valid") {
      setFeedback({ ok: true, message: "✅ Bid placed! Check Your Position below." });
      setBidAmount("");
    } else {
      setFeedback({ ok: false, message: friendlyBidRejection(data?.rejection_reason, state.auction, state.plan) });
    }
    load();
  };

  if (state.loading) {
    return <div className="h-64 grid place-items-center text-muted-foreground text-sm">Loading…</div>;
  }

  if (state.error) {
    return (
      <div className="h-64 grid place-items-center text-center px-4">
        <div>
          <p className="text-sm text-destructive">Could not load the auction: {state.error}</p>
          <button onClick={load} className="mt-3 text-xs text-primary hover:underline">Try again</button>
        </div>
      </div>
    );
  }

  if (!state.auction) {
    // Even with no Auction row yet, members should be able to join the
    // room and chat while waiting — group/monthNumber are computed by
    // load() specifically to support this, so the same room (and its
    // history) carries straight through once the admin actually starts it.
    return (
      <div className="space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-primary">Live Auction</p>
          <h1 className="text-3xl font-semibold text-foreground mt-1">
            {state.group ? `${state.group.group_name || state.group.group_code} — Month ${state.monthNumber}` : "Bid Now"}
          </h1>
        </div>
        <div className="bg-card rounded-2xl border border-border p-12 text-center text-sm text-muted-foreground space-y-3">
          <p>
            {state.group
              ? "Waiting for your group's admin to start this month's auction — join the chat below while you wait."
              : "No open auction right now. Check back once your group's admin starts this month's auction."}
          </p>
          {state.group && (
            <p className="flex items-center justify-center gap-1.5 text-xs font-medium tabular-nums">
              <Radio className="w-3 h-3 animate-pulse text-rose-400" /> Waiting {waitingElapsed}
            </p>
          )}
        </div>
        {state.group && <SoundUnlockBanner />}
        {state.group && (
          <AuctionPresenceChat
            auctionId={null}
            groupId={state.group.id}
            monthNumber={state.monthNumber}
            userId={state.me?.id}
            memberProfileId={state.myMembership?.member_profile_id}
            senderName={state.myName}
            onJoin={(name) => pushToast(`${name} joined`, "join")}
            defaultOpen
          />
        )}
      </div>
    );
  }

  const { auction, group, plan, myMembership, myName, bids, profiles } = state;
  const profileOf = (id) => profiles.find((p) => p.id === id);
  const validBids = bids.filter((b) => b.status === "valid").sort((a, b) => a.amount - b.amount);
  const myBids = bids.filter((b) => b.member_profile_id === myMembership?.member_profile_id);
  const lowest = validBids[0];
  // Once the next valid bid would fall under the plan's minimum, nobody can
  // bid lower: asking for "an amount between $3,500 and $3,400" is
  // impossible, so the bid box is replaced by a plain "minimum reached".
  const atFloorNow = reachedFloor(lowest?.amount, plan.auction_min_bid, auction.min_decrement);
  const iAmWinning = lowest && myMembership && lowest.member_profile_id === myMembership.member_profile_id;
  // The member's own best (lowest) valid bid, if any — validBids is already
  // sorted ascending, so filtering it keeps that order.
  const myBestBid = validBids.find((b) => b.member_profile_id === myMembership?.member_profile_id);

  if (auction.status === "closed") {
    const outcome = calcAuctionOutcome({ plan, winningBid: auction.winning_bid_amount });
    const winnerProf = profileOf(auction.winner_member_profile_id);
    const iWon = myMembership && auction.winner_member_profile_id === myMembership.member_profile_id;

    return (
      <div className="space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-primary">Live Auction</p>
          <h1 className="text-3xl font-semibold text-foreground mt-1">{group.group_name || group.group_code} — Month {auction.month_number}</h1>
        </div>

        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6 space-y-2">
          <p className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
            <Trophy className="w-4 h-4" /> Month {auction.month_number} closed
          </p>
          <p className="text-sm text-foreground">
            {iWon ? "You won this month!" : `Winner: ${winnerProf?.full_name || "Member"}`} — {formatMoney(auction.winning_bid_amount, plan.currency)}
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <Stat label="Winning Bid" value={formatMoney(auction.winning_bid_amount, plan.currency)} />
          <Stat label="Dividend/Member" value={formatMoney(outcome.dividendPerMember, plan.currency)} />
          <Stat label="Next Month's Installment" value={formatMoney(outcome.nextInstallment, plan.currency)} />
        </div>

        <div className="bg-card rounded-2xl border border-border p-5">
          <p className="text-sm font-medium text-foreground flex items-center gap-2 mb-4"><Crown className="w-4 h-4 text-primary" /> Final leaderboard</p>
          {validBids.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No bids were placed.</p>
          ) : (
            <div className="space-y-2">
              {validBids.map((b, i) => (
                <div key={b.id} className={`flex items-center gap-3 p-3 rounded-xl border ${b.member_profile_id === myMembership?.member_profile_id ? "border-primary/50 bg-primary/5" : "border-border"}`}>
                  <span className="w-8 text-center">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{profileOf(b.member_profile_id)?.full_name || "Member"}{b.member_profile_id === myMembership?.member_profile_id ? " (You)" : ""}</p>
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

        <p className="text-xs text-muted-foreground text-center">Next month's auction hasn't started yet — check back once your group's admin opens it.</p>

        <AuctionPresenceChat
          auctionId={auction.id}
          groupId={group.id}
          monthNumber={auction.month_number}
          userId={state.me?.id}
          memberProfileId={myMembership?.member_profile_id}
          senderName={myName}
        />
      </div>
    );
  }

  // The admin has opened the room but not pressed Start yet: members see only
  // the chat (who has joined/left, who's online, with times) — no auction
  // page, no voice, and place_bid refuses bids until bidding_started_at is
  // set. The auction screen appears the moment the admin presses Start.
  if (auction.status === "open" && !auction.bidding_started_at) {
    return (
      <div className="space-y-4">
        <LiveActivityToasts toasts={toasts} />
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-primary">Live auction</p>
          <h1 className="text-xl font-semibold text-foreground">Month {auction.month_number} · {group.group_name || group.group_code}</h1>
          <p className="text-sm text-muted-foreground mt-1">Waiting for the admin to start — chat with your group while everyone joins.</p>
        </div>
        <SoundUnlockBanner />
        <AuctionPresenceChat
          auctionId={auction.id}
          groupId={group.id}
          monthNumber={auction.month_number}
          userId={state.me?.id}
          memberProfileId={myMembership?.member_profile_id}
          senderName={myName}
          onJoin={(name) => pushToast(`${name} joined`, "join")}
          defaultOpen
        />
      </div>
    );
  }

  // Dividend preview for what's typed right now ("if YOUR bid wins"). Shown as
  // one line under the bid box once an amount is typed — the old four-number
  // panel sat above the box all the time and pushed the bid button down.
  const previewOutcome = bidAmount ? calcAuctionOutcome({ plan, winningBid: Number(bidAmount) }) : null;
  const nextValidBid = lowest ? lowest.amount - (auction.min_decrement || 0) : auction.starting_amount;
  const topBids = validBids.slice(0, 3);
  const otherBids = validBids.slice(3);
  const rowFor = (b, i) => (
    <div
      key={i === 0 ? `${b.id}-${bidFlash}` : b.id}
      className={`flex items-center gap-3 px-3 py-2 rounded-xl border transition-colors ${i === 0 ? "border-emerald-500/40 bg-emerald-500/5" : b.member_profile_id === myMembership?.member_profile_id ? "border-primary/50 bg-primary/5" : "border-border"}`}
    >
      <span className="w-6 text-center text-sm">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</span>
      <p className="flex-1 min-w-0 text-sm text-foreground truncate">
        {profileOf(b.member_profile_id)?.full_name || "Member"}{b.member_profile_id === myMembership?.member_profile_id ? " (You)" : ""}
      </p>
      <p className="font-semibold tabular-nums text-foreground">{formatMoney(b.amount, plan.currency)}</p>
    </div>
  );

  // Only what a bidder needs while the clock runs: the price, who's leading,
  // the stage countdown, the bid box and a short leaderboard. Everything else
  // (full leaderboard, your bid history, dividend math) is tucked away or
  // shown only when relevant.
  return (
    <div className="space-y-4">
      <LiveActivityToasts toasts={toasts} />

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.2em] text-primary">Live auction</p>
          <h1 className="text-xl font-semibold text-foreground truncate">Month {auction.month_number} · {group.group_name || group.group_code}</h1>
        </div>
        <span className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 font-medium tabular-nums text-xs">
          <Radio className="w-3 h-3" /> LIVE {elapsed}
        </span>
      </div>

      <SoundUnlockBanner />

      <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-2 border-primary/30 rounded-2xl p-5 text-center">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Current lowest bid</p>
        <p className="text-5xl font-bold text-foreground tabular-nums mt-1">
          {formatMoney(lowest ? lowest.amount : auction.starting_amount, plan.currency)}
        </p>
        <p className="text-sm text-foreground flex items-center justify-center gap-1.5 mt-2">
          <Crown className="w-4 h-4 text-primary" />
          {lowest ? (
            <b>{profileOf(lowest.member_profile_id)?.full_name || "Member"}{lowest.member_profile_id === myMembership?.member_profile_id ? " (You)" : ""}</b>
          ) : (
            <span className="text-muted-foreground">No bids yet — starting amount</span>
          )}
        </p>
        {myBestBid && !myMembership?.has_won && (
          <p className={`inline-block mt-3 px-3 py-1 rounded-full text-xs font-semibold ${iAmWinning ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>
            {iAmWinning ? "🟢 You're leading" : `🔴 Outbid · your best ${formatMoney(myBestBid.amount, plan.currency)}`}
          </p>
        )}
      </div>

      {countdown !== null && (() => {
        // Final call has its own clock (see useCountdown) -- once it hits 0,
        // place_bid() itself starts rejecting new bids, so this shouldn't keep
        // looking like a live countdown still in progress.
        if (auction.status === "final_call" && countdown === 0) {
          return (
            <div className="rounded-2xl p-4 text-center border bg-rose-500/10 border-rose-500/25">
              <p className="text-sm font-semibold text-rose-400">🔒 Bidding closed</p>
              <p className="text-xs text-muted-foreground mt-1">Waiting for the admin to close the auction.</p>
            </div>
          );
        }
        const look = callStageStyle(auction.status, countdown);
        return (
          <div
            key={auction.status}
            className={`rounded-2xl p-4 text-center border transition-colors ${look.card}`}
          >
            <p className={`text-sm font-semibold tracking-wide ${look.label}`}>{look.icon} {CALL_TERMS[auction.status]}</p>
            <p className={`font-bold text-foreground tabular-nums transition-all ${look.number}`}>{countdown}</p>
            {look.hint && <p className="text-xs text-rose-300">{look.hint}</p>}
          </div>
        );
      })()}

      {myMembership?.has_won ? (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 text-sm text-emerald-400 flex items-center gap-2">
          <Building2 className="w-4 h-4" /> You've already won this group — bidding is closed for you.
        </div>
      ) : atFloorNow ? (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 text-sm">
          <p className="font-medium text-emerald-400 flex items-center gap-2"><Gavel className="w-4 h-4" /> Minimum reached</p>
          <p className="text-xs text-muted-foreground mt-1">
            {formatMoney(plan.auction_min_bid, plan.currency)} is the lowest allowed — no lower bid is possible.
            {iAmWinning ? " You're the winning bidder." : ""}
          </p>
        </div>
      ) : (
        <div className="bg-primary/5 rounded-2xl border-2 border-primary/40 p-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-semibold text-muted-foreground pointer-events-none">
                {plan.currency === "CAD" ? "$" : "₹"}
              </span>
              <Input
                type="number"
                value={bidAmount}
                onChange={(e) => { setBidAmount(e.target.value); setConfirmingBid(false); }}
                placeholder={Number(nextValidBid).toLocaleString(plan.currency === "CAD" ? "en-CA" : "en-IN")}
                autoFocus
                // Hides the native up/down spinner — a tiny, easy-to-mis-tap
                // touch target that serves no purpose on a currency field
                // where you're typing a specific amount, not incrementing.
                className={`h-14 pl-9 text-2xl font-semibold border-2 border-primary/50 focus-visible:border-primary rounded-xl [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
              />
            </div>
            <Button
              onClick={onBidButtonClick}
              disabled={submitting || !bidAmount}
              className={`h-14 px-5 rounded-xl font-semibold ${confirmingBid ? "bg-amber-500 hover:bg-amber-500/90 text-amber-950" : "bg-primary hover:bg-primary/90"}`}
            >
              {submitting ? "Submitting…" : confirmingBid ? `Confirm ${formatMoney(Number(bidAmount), plan.currency)}?` : "Place Bid"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {plan.auction_min_bid > 0
              ? `Between ${formatMoney(plan.auction_min_bid, plan.currency)} and ${formatMoney(nextValidBid, plan.currency)}`
              : `Up to ${formatMoney(nextValidBid, plan.currency)}`}
          </p>
          {previewOutcome && (
            <p className="text-xs text-foreground mt-1">
              If you win: dividend <b className="tabular-nums text-primary">{formatMoney(previewOutcome.dividendPerMember, plan.currency)}</b>
              {" · "}next installment <b className="tabular-nums text-primary">{formatMoney(previewOutcome.nextInstallment, plan.currency)}</b>
            </p>
          )}
          {confirmingBid && <p className="text-xs text-amber-400 mt-1">Tap Confirm to lock it in, or edit the amount to cancel.</p>}
          {feedback && (
            <p className={`text-xs mt-1 ${feedback.ok ? "text-emerald-400" : "text-rose-400"}`}>{feedback.message}</p>
          )}
        </div>
      )}

      {validBids.length > 0 && (
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-sm font-medium text-foreground flex items-center gap-2 mb-3"><Crown className="w-4 h-4 text-primary" /> Leaderboard</p>
          <div className="space-y-2">
            {topBids.map((b, i) => rowFor(b, i))}
          </div>
          {otherBids.length > 0 && (
            <details className="mt-2">
              <summary className="text-xs text-muted-foreground cursor-pointer select-none py-1">Show all {validBids.length} bids</summary>
              <div className="space-y-2 mt-2">
                {otherBids.map((b, i) => rowFor(b, i + 3))}
              </div>
            </details>
          )}
        </div>
      )}

      {myBids.length > 0 && (
        <details className="bg-card rounded-2xl border border-border px-4 py-3">
          <summary className="text-sm text-muted-foreground cursor-pointer select-none">Your bids ({myBids.length})</summary>
          <div className="space-y-1 text-xs mt-2">
            {myBids.slice().reverse().map((b) => (
              <p key={b.id} className={b.status === "valid" ? "text-foreground" : "text-muted-foreground"}>
                <span className="font-medium tabular-nums">
                  {new Date(b.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>{" "}
                — {formatMoney(b.amount, plan.currency)} — {b.status === "valid" ? "Accepted" : `Rejected (${b.rejection_reason})`}
              </p>
            ))}
          </div>
        </details>
      )}

      <AuctionPresenceChat
        auctionId={auction.id}
        groupId={group.id}
        monthNumber={auction.month_number}
        userId={state.me?.id}
        memberProfileId={myMembership?.member_profile_id}
        senderName={myName}
        onJoin={(name) => pushToast(`${name} joined`, "join")}
      />
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-5">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground truncate">{value}</p>
    </div>
  );
}
