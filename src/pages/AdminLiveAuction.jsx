import React, { useEffect, useState, useMemo, useCallback } from "react";
import { base44, supabase } from "@/api/base44Client";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { formatMoney } from "@/lib/currency";
import { getStartingAmount, calcAuctionOutcome } from "@/lib/liveAuctionEngine";
import { logAudit } from "@/lib/audit";
import { playCallBell, playGavel, speak, CALL_ANNOUNCEMENTS } from "@/lib/sound";
import { fireConfetti } from "@/lib/confetti";
import { sendWhatsAppMessage } from "@/lib/sendWhatsAppMessage";
import { useCountdown } from "@/lib/useCountdown";
import { Gavel, Crown, Trophy, Building2, Phone } from "lucide-react";
import { useAdminCountry } from "@/lib/AdminCountryContext";
import AuctionPresenceChat from "@/components/auction/AuctionPresenceChat";

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
      .on("postgres_changes", { event: "*", schema: "public", table: "auction_bids", filter: `auction_id=eq.${auction.id}` }, () => loadAuction())
      .on("postgres_changes", { event: "*", schema: "public", table: "auctions", filter: `id=eq.${auction.id}` }, () => loadAuction())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [auction?.id, loadAuction]);

  const profileOf = (id) => profiles.find((p) => p.id === id);
  const validBids = bids.filter((b) => b.status === "valid").sort((a, b) => a.amount - b.amount);
  const rejectedBids = bids.filter((b) => b.status === "rejected");
  const countdown = useCountdown(auction?.call_stage_started_at, auction?.status);

  const startingAmount = plan ? getStartingAmount(plan) : 0;

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
    setBusy(false);
    loadAuction();
  };

  const advanceCall = async (nextStatus) => {
    setBusy(true);
    await base44.entities.Auction.update(auction.id, { status: nextStatus, call_stage_started_at: new Date().toISOString() });
    logAudit({ module: "Live Auction", action: nextStatus, record_id: auction.id, details: `${CALL_LABELS[nextStatus]} started for group ${group.group_code}` });
    playCallBell();
    speak(CALL_ANNOUNCEMENTS[nextStatus]);
    setBusy(false);
    loadAuction();
  };

  const closeAuction = async () => {
    setBusy(true);
    const winningBid = validBids[0];
    const outcome = calcAuctionOutcome({ plan, winningBid: winningBid.amount });
    const me = await base44.auth.me().catch(() => ({}));
    const winnerProf = profileOf(winningBid.member_profile_id);

    const winner = await base44.entities.Winner.create({
      group_id: group.id,
      month_number: auction.month_number,
      member_profile_id: winningBid.member_profile_id,
      membership_id: winningBid.membership_id,
      member_name: winnerProf?.full_name || "Member",
      prize_amount: winningBid.amount,
      announcement_date: new Date().toISOString().slice(0, 10),
      approved_by: me.email || "admin",
      status: "announced",
      selection_method: "live_auction",
    });

    const memberships = await base44.entities.GroupMembership.filter({ group_id: group.id });
    // The winning bid already carries the exact ticket it was placed with
    // (place_bid() resolves this) — a person can hold multiple tickets in
    // the same group, so matching on member_profile_id alone would mark
    // an arbitrary one of their tickets as won instead of the one that
    // actually bid. Fall back to the old member-profile match only for
    // legacy bids recorded before membership_id existed.
    const winningMembership = winningBid.membership_id
      ? memberships.find((m) => m.id === winningBid.membership_id)
      : memberships.find((m) => m.member_profile_id === winningBid.member_profile_id);
    if (winningMembership) {
      await base44.entities.GroupMembership.update(winningMembership.id, { has_won: true });
    }

    const allActive = memberships.filter((m) => m.status === "active");
    if (allActive.length) {
      await base44.entities.Dividend.bulkCreate(
        allActive.map((m) => ({
          member_profile_id: m.member_profile_id,
          user_id: m.user_id,
          group_id: group.id,
          month_number: auction.month_number,
          amount: outcome.dividendPerMember,
          status: "credited",
        }))
      );
    }

    await base44.entities.Auction.update(auction.id, {
      status: "closed",
      winning_bid_amount: winningBid.amount,
      winner_member_profile_id: winningBid.member_profile_id,
      closed_at: new Date().toISOString(),
      closed_by: me.id,
    });
    const newCurrentMonth = Math.min(auction.month_number, plan.duration_months);
    await base44.entities.ChitGroup.update(group.id, { current_month: newCurrentMonth });

    logAudit({ module: "Live Auction", action: "close", record_id: winner.id, details: `Closed Month ${auction.month_number} auction for group ${group.group_code} — winner ${winnerProf?.full_name || "member"} at ${winningBid.amount}` });

    // Send winner announcement messages automatically
    const monthLabel = `Month ${auction.month_number}`;
    const prizeAmountStr = `${plan?.currency || "INR"} ${winningBid.amount}`;
    const winnerName = winnerProf?.full_name || "Member";
    const dividendStr = formatMoney(outcome.dividendPerMember, plan.currency);
    const nextInstallmentStr = formatMoney(outcome.nextInstallment, plan.currency);

    const groupLabel = group.group_name || group.group_code;
    const memberProfiles = await Promise.all(allActive.map(m => base44.entities.MemberProfile.get(m.member_profile_id)));
    for (const prof of memberProfiles) {
      if (prof?.mobile) {
        const isWinner = prof.id === winningBid.member_profile_id;
        const template = isWinner ? "winner_announcement_winner_v4" : "winner_announcement_all_v4";
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
    speak(`Sold! Congratulations to our winner, ${winnerProf?.full_name || "the member"}, at ${formatMoney(winningBid.amount, plan.currency)}!`);
    fireConfetti();
    setBusy(false);
    setCloseConfirmOpen(false);
    setGroups((gs) => gs.map((g) => (g.id === group.id ? { ...g, current_month: newCurrentMonth } : g)));
    loadAuction();
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-primary">Admin</p>
        <h1 className="text-3xl font-semibold text-foreground mt-1">Live Auction</h1>
      </div>

      <div className="bg-card rounded-2xl border border-border p-4 flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">Group:</span>
        <Select value={groupId} onValueChange={setGroupId}>
          <SelectTrigger className="w-96"><SelectValue placeholder="Choose a live auction group" /></SelectTrigger>
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
        />
      )}

      {groupId && plan && !isCompanyMonth && auction && auction.status !== "closed" && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Auction Month" value={`${auction.month_number}/${plan.duration_months}`} />
            <StatCard label="Auction Status" value={auction.status.replace("_", " ")} />
            <StatCard label="Lowest Bid" value={validBids[0] ? formatMoney(validBids[0].amount, plan.currency) : "—"} />
            <StatCard label="Total Bids" value={bids.length} />
          </div>

          {countdown !== null && (
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-6 text-center animate-pulse">
              <p className="text-sm font-semibold text-rose-400 mb-1 tracking-wide">{CALL_LABELS[auction.status]?.toUpperCase()} — ANY LOWER BIDS?</p>
              <p className="text-5xl font-bold text-foreground tabular-nums">{countdown}</p>
            </div>
          )}

          <div className="bg-card rounded-2xl border border-border p-5">
            <p className="text-sm font-medium text-foreground flex items-center gap-2 mb-4"><Crown className="w-4 h-4 text-primary" /> Leaderboard</p>
            {validBids.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No bids yet.</p>
            ) : (
              <div className="space-y-2">
                {validBids.map((b, i) => (
                  <div key={b.id} className="flex items-center gap-3 p-3 rounded-xl border border-border">
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
