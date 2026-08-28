import React, { useEffect, useState, useCallback, useRef } from "react";
import { base44, supabase } from "@/api/base44Client";
import { formatMoney } from "@/lib/currency";
import { calcAuctionOutcome } from "@/lib/liveAuctionEngine";
import { playCallBell, playFanfare, playGavel, speak, CALL_ANNOUNCEMENTS } from "@/lib/sound";
import { fireConfetti, fireWinnerConfetti } from "@/lib/confetti";
import { useCountdown } from "@/lib/useCountdown";
import { logAudit } from "@/lib/audit";
import { Crown, Gavel, Building2, Trophy } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const CALL_LABELS = { call_1: "CALL 1", call_2: "CALL 2", final_call: "FINAL CALL" };

export default function LiveAuction() {
  const [state, setState] = useState({ loading: true });
  const [bidAmount, setBidAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const prevStatusRef = useRef(null);
  const joinLoggedRef = useRef(new Set());

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

      setState({ loading: false, me, auction, group, plan, myMembership, bids, profiles });
    } catch (err) {
      setState({ loading: false, error: err.message || String(err) });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!state.auction) return;
    const channel = supabase
      .channel(`member-auction-${state.auction.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "auction_bids", filter: `auction_id=eq.${state.auction.id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "auctions", filter: `id=eq.${state.auction.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [state.auction?.id, load]);

  const countdown = useCountdown(state.auction?.call_stage_started_at, state.auction?.status);

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
        speak(CALL_ANNOUNCEMENTS[auction.status]);
      } else if (auction.status === "closed") {
        const iWon = state.myMembership && auction.winner_member_profile_id === state.myMembership.member_profile_id;
        if (iWon) {
          playFanfare();
          speak("Sold! Congratulations, you won this month's auction.");
          fireWinnerConfetti();
        } else {
          playGavel();
          speak("Sold! The auction has closed.");
          fireConfetti();
        }
      }
    }
    prevStatusRef.current = auction.status;
  }, [state.auction, state.myMembership]);

  const submitBid = async () => {
    if (!bidAmount || !state.auction) return;
    setSubmitting(true);
    setFeedback(null);
    const { data, error } = await supabase.rpc("place_bid", {
      p_auction_id: state.auction.id,
      p_amount: Number(bidAmount),
    });
    setSubmitting(false);
    if (error) {
      setFeedback({ ok: false, message: error.message });
      return;
    }
    if (data?.status === "valid") {
      setFeedback({ ok: true, message: "You're currently the lowest bid — not final until the admin closes the auction." });
      setBidAmount("");
    } else {
      setFeedback({ ok: false, message: data?.rejection_reason || "Bid rejected" });
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

  const { auction, group, plan, myMembership, bids, profiles } = state;
  const profileOf = (id) => profiles.find((p) => p.id === id);
  const validBids = bids.filter((b) => b.status === "valid").sort((a, b) => a.amount - b.amount);
  const myBids = bids.filter((b) => b.member_profile_id === myMembership?.member_profile_id);
  const lowest = validBids[0];
  const iAmWinning = lowest && myMembership && lowest.member_profile_id === myMembership.member_profile_id;

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
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-primary">Live Auction</p>
        <h1 className="text-3xl font-semibold text-foreground mt-1">{group.group_name || group.group_code} — Month {auction.month_number}</h1>
        <p className="text-sm text-muted-foreground mt-1 capitalize">Status: {auction.status.replace("_", " ")}</p>
      </div>

      <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 text-sm text-amber-300">
        Bids aren't final until your group's admin closes the auction. The lowest bid at that moment wins — someone can still outbid you.
      </div>

      {countdown !== null && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-6 text-center animate-pulse">
          <p className="text-sm font-semibold text-rose-400 mb-1 tracking-wide">{CALL_LABELS[auction.status]} — ANY LOWER BIDS?</p>
          <p className="text-5xl font-bold text-foreground tabular-nums">{countdown}</p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Lowest Bid" value={lowest ? formatMoney(lowest.amount, plan.currency) : "—"} />
        <Stat label="Current Leader" value={lowest ? profileOf(lowest.member_profile_id)?.full_name || "Member" : "—"} />
        <Stat label="Total Bids" value={validBids.length} />
        <Stat label="Your Bids" value={myBids.length} />
      </div>

      {myMembership?.has_won ? (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5 text-sm text-emerald-400 flex items-center gap-2">
          <Building2 className="w-4 h-4" /> You've already won this group — bidding is closed for you.
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border p-5">
          <p className="text-sm font-medium text-foreground mb-3 flex items-center gap-2"><Gavel className="w-4 h-4 text-primary" /> Place a bid</p>
          <div className="flex gap-2">
            <Input
              type="number"
              value={bidAmount}
              onChange={(e) => setBidAmount(e.target.value)}
              placeholder={lowest ? `Below ${formatMoney(lowest.amount - (auction.min_decrement || 0), plan.currency)}` : `Up to ${formatMoney(auction.starting_amount, plan.currency)}`}
              className="flex-1"
            />
            <Button onClick={submitBid} disabled={submitting || !bidAmount} className="bg-primary hover:bg-primary/90 rounded-full">
              {submitting ? "Submitting…" : "Submit Bid"}
            </Button>
          </div>
          {feedback && (
            <p className={`text-xs mt-2 ${feedback.ok ? "text-emerald-400" : "text-rose-400"}`}>{feedback.message}</p>
          )}
          {iAmWinning && <p className="text-xs text-primary mt-2">You're currently the lowest bidder!</p>}
        </div>
      )}

      <div className="bg-card rounded-2xl border border-border p-5">
        <p className="text-sm font-medium text-foreground flex items-center gap-2 mb-4"><Crown className="w-4 h-4 text-primary" /> Leaderboard</p>
        {validBids.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No bids yet — be the first!</p>
        ) : (
          <div className="space-y-2">
            {validBids.map((b, i) => (
              <div key={b.id} className={`flex items-center gap-3 p-3 rounded-xl border ${b.member_profile_id === myMembership?.member_profile_id ? "border-primary/50 bg-primary/5" : "border-border"}`}>
                <span className="w-8 text-center">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{profileOf(b.member_profile_id)?.full_name || "Member"}{b.member_profile_id === myMembership?.member_profile_id ? " (You)" : ""}</p>
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
