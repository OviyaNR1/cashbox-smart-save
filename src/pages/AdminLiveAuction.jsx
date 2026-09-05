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
import { playCallBell, playGavel, playBidPlaced, CALL_TERMS, speakCallAnnouncement } from "@/lib/sound";
import { speakAnnouncement } from "@/lib/tts";
import { announceAuctionStart, announceAuctionClosed, announceWinner, announceNewLowestBid, shouldAnnounceBid } from "@/lib/auctionAnnouncements";
import { fireConfetti } from "@/lib/confetti";
import { sendWhatsAppMessage } from "@/lib/sendWhatsAppMessage";
import { useCountdown } from "@/lib/useCountdown";
import { useElapsedTime } from "@/lib/useElapsedTime";
import { useLiveToasts } from "@/lib/useLiveToasts";
import { Gavel, Crown, Trophy, Building2, Phone, Radio, Eye } from "lucide-react";
import { useAdminCountry } from "@/lib/AdminCountryContext";
import AuctionPresenceChat from "@/components/auction/AuctionPresenceChat";
import LiveActivityToasts from "@/components/auction/LiveActivityToasts";

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
  const [companyMonthRecorded, setCompanyMonthRecorded] = useState(false);
  const [me, setMe] = useState(null);
  const [watchingCount, setWatchingCount] = useState(0);
  const [bidFlash, setBidFlash] = useState(0);
  const { toasts, pushToast } = useLiveToasts();

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
          base44.entities.MemberProfile.get(payload.new.member_profile_id)
            .then((p) => pushToast(`${p?.full_name || "A member"} sent the lowest bid`, "bid"))
            .catch(() => pushToast("A member sent the lowest bid", "bid"));
          // Throttled — a burst of bids only gets one excited reaction, not
          // one stacked announcement per bid.
          if (shouldAnnounceBid()) {
            speakAnnouncement(announceNewLowestBid(payload.new.amount, plan?.currency).parts);
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
  const countdown = useCountdown(auction?.call_stage_started_at, auction?.status);
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
  const autoAdvancedKeyRef = useRef(null);
  useEffect(() => {
    if (countdown === null || countdown > 0 || !auction) return;
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

  // A new, lower bid mid-call means the price just being called is stale —
  // restart the count at "Oru Tharam" for the new lowest bid rather than
  // continuing call 2/final call for a price nobody's actually offering
  // anymore.
  const leadingBidIdRef = useRef(null);
  useEffect(() => {
    if (!auction) { leadingBidIdRef.current = null; return; }
    const leadingId = validBids[0]?.id || null;
    const inCallStage = ["call_1", "call_2", "final_call"].includes(auction.status);
    if (inCallStage && leadingBidIdRef.current && leadingId && leadingId !== leadingBidIdRef.current) {
      advanceCall("call_1");
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

  const startAuction = async () => {
    setBusy(true);
    const created = await base44.entities.Auction.create({
      group_id: group.id,
      month_number: targetMonth,
      status: "open",
      starting_amount: startingAmount,
      min_decrement: plan.auction_min_decrement || 25,
    });
    logAudit({ module: "Live Auction", action: "start", record_id: created.id, details: `Started Month ${targetMonth} auction for group ${group.group_code} (starting ${startingAmount})` });
    const { parts, visual } = announceAuctionStart(startingAmount, plan.currency);
    pushToast(visual, "default");
    speakAnnouncement(parts);
    setBusy(false);
    loadAuction();
  };

  const advanceCall = async (nextStatus) => {
    setBusy(true);
    await base44.entities.Auction.update(auction.id, { status: nextStatus, call_stage_started_at: new Date().toISOString() });
    logAudit({ module: "Live Auction", action: nextStatus, record_id: auction.id, details: `${CALL_LABELS[nextStatus]} (${CALL_TERMS[nextStatus]}) started for group ${group.group_code} at ${formatMoney(calledAmount, plan.currency)}` });
    playCallBell();
    speakCallAnnouncement(nextStatus, calledAmount, plan.currency);
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
      if (prof?.mobile) {
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
    const closedLine = announceAuctionClosed();
    pushToast(closedLine.visual, "default");
    speakAnnouncement(closedLine.parts);
    setTimeout(() => {
      const winnerLine = announceWinner(winnerProf?.full_name || "Member", winningAmount, plan.currency);
      pushToast(winnerLine.visual, "bid");
      speakAnnouncement(winnerLine.parts);
    }, 1800);
    setBusy(false);
    setCloseConfirmOpen(false);
    setGroups((gs) => gs.map((g) => (g.id === group.id ? { ...g, current_month: newCurrentMonth } : g)));
    loadAuction();
  };

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
          <Button onClick={startAuction} disabled={busy} className="bg-primary hover:bg-primary/90 rounded-full">
            <Gavel className="w-4 h-4 mr-1" /> {busy ? "Starting…" : `Start Auction for Month ${targetMonth}`}
          </Button>
        </div>
      )}

      {groupId && plan && !isCompanyMonth && auction && auction.status === "closed" && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6 space-y-2">
          <p className="text-sm font-semibold text-emerald-400 flex items-center gap-2"><Trophy className="w-4 h-4" /> Month {auction.month_number} closed</p>
          <p className="text-sm text-foreground">Winner: {profileOf(auction.winner_member_profile_id)?.full_name || "Member"} — {formatMoney(auction.winning_bid_amount, plan.currency)}</p>
          <p className="text-xs text-muted-foreground">Group has advanced to month {group.current_month}. Select the group again or refresh to manage the next month.</p>
        </div>
      )}

      {groupId && plan && !isCompanyMonth && auction && (
        <AuctionPresenceChat
          auctionId={auction.id}
          groupId={group.id}
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

      {groupId && plan && !isCompanyMonth && auction && auction.status !== "closed" && (
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
            const tier = countdown <= 10 ? "dramatic" : countdown <= 30 ? "elevated" : "normal";
            return (
              <div
                className={`rounded-2xl p-6 text-center border transition-colors motion-reduce:animate-none ${
                  tier === "dramatic"
                    ? "bg-rose-500/20 border-rose-500/40 animate-pulse"
                    : tier === "elevated"
                    ? "bg-rose-500/10 border-rose-500/25"
                    : "bg-amber-500/10 border-amber-500/20"
                }`}
              >
                <p className={`text-sm font-semibold mb-1 tracking-wide ${tier === "normal" ? "text-amber-400" : "text-rose-400"}`}>
                  {formatMoney(calledAmount, plan.currency)} — {CALL_TERMS[auction.status]}
                </p>
                <p className={`font-bold text-foreground tabular-nums transition-all ${tier === "dramatic" ? "text-7xl" : "text-5xl"}`}>{countdown}</p>
              </div>
            );
          })()}

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
                      <p className="text-xs text-muted-foreground">{new Date(b.created_at).toLocaleTimeString()}</p>
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
                  <p key={b.id}>{profileOf(b.member_profile_id)?.full_name || "Member"} — {formatMoney(b.amount, plan.currency)} — {b.rejection_reason}</p>
                ))}
              </div>
            </div>
          )}

          <div className="bg-card rounded-2xl border border-border p-5 flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => advanceCall("call_1")} disabled={busy || auction.status !== "open"} className="rounded-full">
              <Phone className="w-4 h-4 mr-1" /> Call 1
            </Button>
            <Button variant="outline" onClick={() => advanceCall("call_2")} disabled={busy || auction.status !== "call_1"} className="rounded-full">
              Call 2
            </Button>
            <Button variant="outline" onClick={() => advanceCall("final_call")} disabled={busy || auction.status !== "call_2"} className="rounded-full">
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
