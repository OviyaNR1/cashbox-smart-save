import React, { useEffect, useState, useCallback, useRef } from "react";
import { base44, supabase } from "@/api/base44Client";
import { formatMoney } from "@/lib/currency";
import { calcAuctionOutcome } from "@/lib/liveAuctionEngine";
import { playCallBell, playFanfare, playGavel, playBidPlaced, speak, CALL_TERMS, callAnnouncement, speakCallAnnouncement } from "@/lib/sound";
import { fireConfetti, fireWinnerConfetti } from "@/lib/confetti";
import { useCountdown } from "@/lib/useCountdown";
import { useElapsedTime } from "@/lib/useElapsedTime";
import { useLiveToasts } from "@/lib/useLiveToasts";
import { logAudit } from "@/lib/audit";
import { Crown, Gavel, Building2, Trophy, Radio, Users, Calendar } from "lucide-react";
import { collectionDateUTC } from "@/lib/dates";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import AuctionPresenceChat from "@/components/auction/AuctionPresenceChat";
import LiveActivityToasts from "@/components/auction/LiveActivityToasts";

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
    case "Duplicate bid":
      return "Someone already bid that exact amount. Try a lower number.";
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
  const [bidAmount, setBidAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [confirmingBid, setConfirmingBid] = useState(false);
  const prevStatusRef = useRef(null);
  const joinLoggedRef = useRef(new Set());
  const [bidFlash, setBidFlash] = useState(0);
  const [showRules, setShowRules] = useState(false);
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
      const group = picked?.group || null;
      const plan = picked?.plan || null;
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

      setState({ loading: false, me, auction, group, plan, myMembership, myName: myProfile?.full_name || "Member", bids, profiles });
    } catch (err) {
      setState({ loading: false, error: err.message || String(err) });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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
        }
        load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "auctions", filter: `id=eq.${state.auction.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [state.auction?.id, load]);

  const countdown = useCountdown(state.auction?.call_stage_started_at, state.auction?.status);
  const elapsed = useElapsedTime(state.auction?.status !== "closed" ? state.auction?.created_at : null);

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
        playCallBell();
        const validBidsNow = (state.bids || []).filter((b) => b.status === "valid").sort((a, b) => a.amount - b.amount);
        const calledAmount = validBidsNow[0]?.amount ?? auction.starting_amount;
        speakCallAnnouncement(auction.status, formatMoney(calledAmount, state.plan?.currency));
      } else if (auction.status === "closed") {
        const iWon = state.myMembership && auction.winner_member_profile_id === state.myMembership.member_profile_id;
        if (iWon) {
          playFanfare();
          speak(`Sold! You won Month ${auction.month_number}.`);
          fireWinnerConfetti();
        } else {
          playGavel();
          const winnerName = state.profiles?.find((p) => p.id === auction.winner_member_profile_id)?.full_name;
          speak(winnerName ? `Sold! Month ${auction.month_number} goes to ${winnerName}!` : `Sold! Month ${auction.month_number} has closed.`);
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
    return (
      <div className="space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-primary">Live Auction</p>
          <h1 className="text-3xl font-semibold text-foreground mt-1">Bid Now</h1>
        </div>
        <div className="bg-card rounded-2xl border border-border p-12 text-center text-sm text-muted-foreground">
          No open auction right now. Check back once your group's admin starts this month's auction.
        </div>
      </div>
    );
  }

  const { auction, group, plan, myMembership, myName, bids, profiles } = state;
  const profileOf = (id) => profiles.find((p) => p.id === id);
  const validBids = bids.filter((b) => b.status === "valid").sort((a, b) => a.amount - b.amount);
  const myBids = bids.filter((b) => b.member_profile_id === myMembership?.member_profile_id);
  const lowest = validBids[0];
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
          userId={state.me?.id}
          memberProfileId={myMembership?.member_profile_id}
          senderName={myName}
        />
      </div>
    );
  }

  // The number to preview dividend math for: what's typed right now takes
  // priority ("if YOUR bid wins"), falling back to the current lowest bid
  // ("if the auction closed right now"). Nothing to preview before any
  // number exists at all.
  const previewAmount = bidAmount ? Number(bidAmount) : lowest?.amount;
  const previewOutcome = previewAmount ? calcAuctionOutcome({ plan, winningBid: previewAmount }) : null;
  const collectionDate = group.start_date
    ? collectionDateUTC(group.start_date, auction.month_number, group.monthly_collection_date)
    : null;
  const collectionDateLabel = collectionDate
    ? (() => {
        const [y, m, d] = collectionDate.split("-").map(Number);
        return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
      })()
    : null;

  return (
    <div className="space-y-6">
      <LiveActivityToasts toasts={toasts} />

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-primary">Live Auction</p>
          <h1 className="text-3xl font-semibold text-foreground mt-1">{group.group_name || group.group_code} — Month {auction.month_number}</h1>
        </div>
        {/* A constant, honest "this has been live for X" signal — like a
            phone call's recording timer — distinct from the per-call-stage
            countdown below, which only runs during an active call. */}
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 font-medium tabular-nums text-xs">
          <Radio className="w-3 h-3 animate-pulse" /> LIVE {elapsed}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> {formatMoney(plan.chit_amount, plan.currency)} plan</span>
        {collectionDateLabel && (
          <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {collectionDateLabel}</span>
        )}
        <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {plan.member_count || "—"} members</span>
        <span>{validBids.length} bids so far</span>
        <span>Ends when admin closes</span>
      </div>

      <button
        type="button"
        onClick={() => setShowRules((v) => !v)}
        className="text-xs text-primary hover:underline flex items-center gap-1 -mt-1"
      >
        ⓘ How does this auction work?
      </button>
      {showRules && (
        <div className="bg-card rounded-xl border border-border p-4 text-xs text-muted-foreground space-y-2 -mt-2">
          <p><b className="text-foreground">1. Enter your bid.</b> It must be lower than the current lowest bid shown below.</p>
          <p><b className="text-foreground">2. Lowest bid wins.</b> Whoever has the lowest valid bid when the admin closes the auction wins this month.</p>
          <p><b className="text-foreground">3. The dividend is shared.</b> The gap between the chit value and the winning bid is split evenly across all members and reduces everyone's next installment.</p>
          <p><b className="text-foreground">4. The admin closes the auction.</b> Nothing is final until then — you can keep bidding while it's open.</p>
        </div>
      )}

      {/* Hero: the one thing a member should see in the first second. */}
      <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-2 border-primary/30 rounded-2xl p-6 text-center">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Current Lowest Bid</p>
        <p className="text-5xl sm:text-6xl font-bold text-foreground tabular-nums mt-1">
          {formatMoney(lowest ? lowest.amount : auction.starting_amount, plan.currency)}
        </p>
        <p className="text-sm text-foreground flex items-center justify-center gap-1.5 mt-2">
          <Crown className="w-4 h-4 text-primary" />
          {lowest ? (
            <>Leader: <b>{profileOf(lowest.member_profile_id)?.full_name || "Member"}{lowest.member_profile_id === myMembership?.member_profile_id ? " (You)" : ""}</b></>
          ) : (
            "No bids yet — this is the starting amount"
          )}
        </p>
        <p className="text-xs text-muted-foreground mt-2">Lowest bid wins when the admin closes the auction.</p>
      </div>

      <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 text-sm text-amber-300 flex items-start gap-2">
        <span>🔔</span>
        <span><b>Important:</b> The lowest bid does not win until the admin officially closes the auction. You can keep bidding while it's open.</span>
      </div>

      {myBestBid && !myMembership?.has_won && (
        <div className={`rounded-2xl border p-5 ${iAmWinning ? "bg-emerald-500/10 border-emerald-500/20" : "bg-rose-500/10 border-rose-500/20"}`}>
          <p className={`text-sm font-semibold flex items-center gap-2 mb-3 ${iAmWinning ? "text-emerald-400" : "text-rose-400"}`}>
            {iAmWinning ? "🟢 You're currently winning!" : "🔴 You've been outbid"}
          </p>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm text-foreground">
            <span>Your bid: <b className="tabular-nums">{formatMoney(myBestBid?.amount, plan.currency)}</b></span>
            <span>Current lowest: <b className="tabular-nums">{formatMoney(lowest.amount, plan.currency)}</b></span>
          </div>
        </div>
      )}

      {countdown !== null && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-6 text-center animate-pulse">
          <p className="text-sm font-semibold text-rose-400 mb-1 tracking-wide">
            ⚠️ {CALL_TERMS[auction.status]} — {formatMoney(lowest ? lowest.amount : auction.starting_amount, plan.currency)}
          </p>
          <p className="text-5xl font-bold text-foreground tabular-nums">{countdown}</p>
        </div>
      )}

      {previewOutcome && (
        <div className="bg-card rounded-2xl border border-border p-5">
          <p className="text-sm font-medium text-foreground mb-3">
            💰 {bidAmount ? "If your bid wins" : "If the current lowest bid wins"}
          </p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <MoneyRow label="Winning bid" value={formatMoney(previewAmount, plan.currency)} />
            <MoneyRow label="Total dividend" value={formatMoney(previewOutcome.discount, plan.currency)} />
            <MoneyRow label="Your dividend share" value={formatMoney(previewOutcome.dividendPerMember, plan.currency)} emphasize />
            <MoneyRow label="Next installment" value={formatMoney(previewOutcome.nextInstallment, plan.currency)} emphasize />
          </div>
        </div>
      )}

      {myMembership?.has_won ? (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5 text-sm text-emerald-400 flex items-center gap-2">
          <Building2 className="w-4 h-4" /> You've already won this group — bidding is closed for you.
        </div>
      ) : (
        <div className="bg-primary/5 rounded-2xl border-2 border-primary/40 p-5">
          <p className="text-sm font-medium text-foreground mb-1 flex items-center gap-2"><Gavel className="w-4 h-4 text-primary" /> Enter Your Bid</p>
          <p className="text-xs text-muted-foreground mb-3">
            {lowest
              ? <>Your bid must be lower than <b className="text-foreground">{formatMoney(lowest.amount, plan.currency)}</b></>
              : <>Your bid must be <b className="text-foreground">{formatMoney(auction.starting_amount, plan.currency)}</b> or lower</>}
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-semibold text-muted-foreground pointer-events-none">
                ₹
              </span>
              <Input
                type="number"
                value={bidAmount}
                onChange={(e) => { setBidAmount(e.target.value); setConfirmingBid(false); }}
                placeholder={
                  lowest
                    ? `${(lowest.amount - (auction.min_decrement || 0)).toLocaleString("en-IN")} or lower`
                    : `${Number(auction.starting_amount).toLocaleString("en-IN")} or lower`
                }
                autoFocus
                // Hides the native up/down spinner — a tiny, easy-to-mis-tap
                // touch target that serves no purpose on a currency field
                // where you're typing a specific amount, not incrementing.
                // The glow only runs while empty — once someone's typed an
                // amount it's obviously found, and a pulsing focused input
                // would just be distracting rather than helpful.
                className={`h-14 pl-9 text-2xl font-semibold border-2 border-primary/50 focus-visible:border-primary rounded-xl [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${!bidAmount ? "bid-input-glow" : ""}`}
              />
            </div>
            <Button
              onClick={onBidButtonClick}
              disabled={submitting || !bidAmount}
              className={`h-14 px-6 rounded-xl font-semibold ${confirmingBid ? "bg-amber-500 hover:bg-amber-500/90 text-amber-950" : "bg-primary hover:bg-primary/90"}`}
            >
              {submitting ? "Submitting…" : confirmingBid ? `Confirm ${formatMoney(Number(bidAmount), plan.currency)}?` : "Place Bid"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">💡 Lower bid = higher dividend for all members.</p>
          {confirmingBid && (
            <p className="text-xs text-amber-400 mt-2">
              Tap Confirm to lock in this bid, or change the amount above to cancel.
            </p>
          )}
          {feedback && (
            <p className={`text-xs mt-2 ${feedback.ok ? "text-emerald-400" : "text-rose-400"}`}>{feedback.message}</p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-3 pt-3 border-t border-border/60">
            <span>Starting bid: <b className="text-foreground">{formatMoney(auction.starting_amount, plan.currency)}</b></span>
            {plan.auction_min_bid > 0 && (
              <span>Minimum allowed bid: <b className="text-foreground">{formatMoney(plan.auction_min_bid, plan.currency)}</b></span>
            )}
            <span>Lower bid wins</span>
          </div>
        </div>
      )}

      <div className="bg-card rounded-2xl border border-border p-5">
        <p className="text-sm font-medium text-foreground flex items-center gap-2 mb-4"><Crown className="w-4 h-4 text-primary" /> Live Leaderboard</p>
        {validBids.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No bids yet — be the first!</p>
        ) : (
          <div className="space-y-2">
            {/* Top row's key includes bidFlash so the flash animation
                replays every time the #1 spot changes, not just once. */}
            {validBids.map((b, i) => (
              <div
                key={i === 0 ? `${b.id}-${bidFlash}` : b.id}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${i === 0 ? "border-emerald-500/40 bg-emerald-500/5" : b.member_profile_id === myMembership?.member_profile_id ? "border-primary/50 bg-primary/5" : "border-border"} ${i === 0 ? "animate-in fade-in zoom-in-95 duration-500" : ""}`}>
                <span className="w-8 text-center">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate flex items-center gap-1.5">
                    {profileOf(b.member_profile_id)?.full_name || "Member"}{b.member_profile_id === myMembership?.member_profile_id ? " (You)" : ""}
                    {i === 0 && <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide">Leading</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{new Date(b.created_at).toLocaleTimeString()}</p>
                </div>
                <p className="font-semibold tabular-nums text-foreground">{formatMoney(b.amount, plan.currency)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {myBids.length > 0 && (
        <div className="bg-card rounded-2xl border border-border p-5">
          <p className="text-sm font-medium text-foreground mb-3">Your bid history</p>
          <div className="space-y-1 text-xs">
            {myBids.slice().reverse().map((b) => (
              <p key={b.id} className={b.status === "valid" ? "text-foreground" : "text-muted-foreground"}>
                {formatMoney(b.amount, plan.currency)} — {b.status === "valid" ? "Accepted" : `Rejected (${b.rejection_reason})`}
              </p>
            ))}
          </div>
        </div>
      )}

      <AuctionPresenceChat
        auctionId={auction.id}
        groupId={group.id}
        userId={state.me?.id}
        memberProfileId={myMembership?.member_profile_id}
        senderName={myName}
        onJoin={(name) => pushToast(`${name} joined`, "join")}
      />
    </div>
  );
}

function MoneyRow({ label, value, emphasize }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`tabular-nums ${emphasize ? "text-lg font-semibold text-primary" : "text-sm font-medium text-foreground"}`}>{value}</p>
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
