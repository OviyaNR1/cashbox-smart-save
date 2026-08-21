import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Link } from "react-router-dom";
import { Trophy, Crown, Megaphone, Check, Building2, Gavel } from "lucide-react";
import { formatMoney } from "@/lib/currency";
import { generateLakhBoxPlan } from "@/lib/lakhboxEngine";
import { logAudit } from "@/lib/audit";
import { useAdminCountry } from "@/lib/AdminCountryContext";

const statusTone = (s) => s === "paid" ? "bg-emerald-500/15 text-emerald-400" : s === "announced" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground";

export default function Winners() {
  const { country: countryFilter } = useAdminCountry();
  const [groups, setGroups] = useState([]);
  const [plans, setPlans] = useState([]);
  const [groupId, setGroupId] = useState("");
  const [memberships, setMemberships] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [winners, setWinners] = useState(null);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    base44.entities.ChitGroup.filter({ status: "active" }).then(setGroups);
    base44.entities.ChitPlan.list("-created_date", 100).then(setPlans);
  }, []);

  useEffect(() => {
    if (!groupId) return;
    (async () => {
      const [ms, ws] = await Promise.all([
        base44.entities.GroupMembership.filter({ group_id: groupId }),
        base44.entities.Winner.filter({ group_id: groupId }, "-month_number", 50),
      ]);
      setMemberships(ms);
      const profIds = [...new Set(ms.map((m) => m.member_profile_id))];
      const profs = profIds.length ? await Promise.all(profIds.map((id) => base44.entities.MemberProfile.get(id))) : [];
      setProfiles(profs);
      setWinners(ws);
    })();
  }, [groupId]);

  const group = groups.find((g) => g.id === groupId);
  const plan = plans.find((p) => p.id === group?.plan_id);
  const profileOf = (id) => profiles.find((p) => p.id === id);
  const wonIds = new Set(winners?.map((w) => w.member_profile_id) || []);
  const nextMonth = (winners?.length || 0) + 1;

  const isLakhBox = plan?.model === "lakhbox";
  const isLiveAuction = plan?.model === "live_auction";
  const lakhboxResult = isLakhBox && plan ? generateLakhBoxPlan(plan) : null;
  const lakhboxRow = lakhboxResult?.monthlySummary[nextMonth - 1];
  const isCompanyMonth = isLakhBox && nextMonth === 1;
  const lakhboxTarget = isLakhBox && !isCompanyMonth
    ? memberships.find((m) => m.ticket_number === nextMonth && m.status === "active" && !m.has_won)
    : null;

  const prizeAmount = isLakhBox
    ? (lakhboxRow?.winnerPayout || 0)
    : (plan ? plan.chit_amount - plan.chit_amount * (plan.commission_percent / 100) : 0);

  const eligible = isLakhBox
    ? (lakhboxTarget ? [lakhboxTarget] : [])
    : memberships.filter((m) => m.status === "active" && !m.has_won && !wonIds.has(m.member_profile_id));

  const drawWinner = () => {
    if (isLakhBox) {
      if (!lakhboxTarget) return;
      setSelected(lakhboxTarget.member_profile_id);
      return;
    }
    if (eligible.length === 0) return;
    const pick = eligible[Math.floor(Math.random() * eligible.length)];
    setSelected(pick.member_profile_id);
  };

  const announce = async () => {
    if (!selected) return;
    setSaving(true);
    const ms = memberships.find((m) => m.member_profile_id === selected);
    const prof = profileOf(selected);
    const me = await base44.auth.me().catch(() => ({}));
    const prize = isLakhBox ? (lakhboxRow?.winnerPayout || 0) : prizeAmount;

    const createdWinner = await base44.entities.Winner.create({
      group_id: groupId,
      month_number: nextMonth,
      member_profile_id: selected,
      member_name: prof?.full_name || "Member",
      prize_amount: Math.round(prize),
      announcement_date: new Date().toISOString().slice(0, 10),
      approved_by: me.email || "admin",
      status: "announced",
    });
    await base44.entities.GroupMembership.update(ms.id, { has_won: true });
    await base44.entities.ChitGroup.update(groupId, { current_month: Math.min(nextMonth + 1, plan.duration_months) });
    logAudit({ module: "Winners", action: "announce", record_id: createdWinner.id, details: `Announced ${prof?.full_name || "member"} as Month ${nextMonth} winner (${Math.round(prize)}) in group ${groupId}` });

    if (plan && !isLakhBox) {
      const allActive = memberships.filter((m) => m.status === "active");
      await base44.entities.Dividend.bulkCreate(
        allActive.map((m) => ({
          member_profile_id: m.member_profile_id,
          user_id: m.user_id,
          group_id: groupId,
          month_number: nextMonth,
          amount: plan.fixed_dividend,
          status: "credited",
        }))
      );
    }

    setSaving(false);
    setSelected(null);
    const ws = await base44.entities.Winner.filter({ group_id: groupId }, "-month_number", 50);
    setWinners(ws);
    const ms2 = await base44.entities.GroupMembership.filter({ group_id: groupId });
    setMemberships(ms2);
  };

  const recordCompanyMonth = async () => {
    if (!isCompanyMonth || !lakhboxResult) return;
    setSaving(true);
    const me = await base44.auth.me().catch(() => ({}));
    const createdWinner = await base44.entities.Winner.create({
      group_id: groupId,
      month_number: 1,
      member_profile_id: null,
      member_name: plan.company_label || "CashBox",
      prize_amount: Math.round(lakhboxResult.monthlySummary[0].winnerPayout),
      announcement_date: new Date().toISOString().slice(0, 10),
      approved_by: me.email || "admin",
      status: "announced",
    });
    await base44.entities.ChitGroup.update(groupId, { current_month: Math.min(2, plan.duration_months) });
    logAudit({ module: "Winners", action: "record-company-month", record_id: createdWinner.id, details: `Recorded Month 1 company income for group ${groupId}` });
    setSaving(false);
    const ws = await base44.entities.Winner.filter({ group_id: groupId }, "-month_number", 50);
    setWinners(ws);
  };

  const markPaid = async (w) => {
    await base44.entities.Winner.update(w.id, { status: "paid" });
    logAudit({ module: "Winners", action: "mark-paid", record_id: w.id, details: `Marked Month ${w.month_number} winner "${w.member_name}" as paid` });
    setWinners((ws) => ws.map((x) => (x.id === w.id ? { ...x, status: "paid" } : x)));
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-primary">Admin</p>
        <h1 className="text-3xl font-semibold text-foreground mt-1">Winner management</h1>
      </div>

      <div className="bg-card rounded-2xl border border-border p-5">
        <p className="text-sm font-medium text-foreground mb-3">Select group</p>
        <Select value={groupId} onValueChange={setGroupId}>
          <SelectTrigger className="max-w-md"><SelectValue placeholder="Choose a chit group" /></SelectTrigger>
          <SelectContent>
            {groups
              .filter((g) => {
                const pl = plans.find((p) => p.id === g.plan_id);
                return ((pl?.currency || "INR") === "CAD" ? "Canada" : "India") === countryFilter;
              })
              .map((g) => {
                const pl = plans.find((p) => p.id === g.plan_id);
                return <SelectItem key={g.id} value={g.id}>{g.group_code} — {pl?.plan_name || "Plan"}</SelectItem>;
              })}
          </SelectContent>
        </Select>
      </div>

      {!groupId && <p className="text-sm text-muted-foreground">Select a group to manage winners.</p>}

      {groupId && plan && isLiveAuction && (
        <div className="bg-card rounded-2xl border border-primary/30 p-6 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Gavel className="w-5 h-5 text-primary shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">This group uses Live Auction bidding</p>
              <p className="text-xs text-muted-foreground mt-0.5">Winners here are decided by competitive bidding, not a draw — manage this group's auction from the Live Auction page.</p>
            </div>
          </div>
          <Link to="/admin/live-auction" className="text-sm px-4 py-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 shrink-0">
            Go to Live Auction
          </Link>
        </div>
      )}

      {groupId && plan && !isLiveAuction && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card rounded-2xl border border-border p-5">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Current month</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{nextMonth}/{plan.duration_months}</p>
            </div>
            <div className="bg-card rounded-2xl border border-border p-5">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Eligible members</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{eligible.length}</p>
            </div>
            <div className="bg-card rounded-2xl border border-border p-5">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">{isCompanyMonth ? "Company income" : "Prize amount"}</p>
              <p className="mt-2 text-2xl font-semibold text-emerald-400">{formatMoney(Math.round(prizeAmount), plan.currency)}</p>
            </div>
            <div className="bg-card rounded-2xl border border-border p-5">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">{isLakhBox ? "Monthly payment" : "Dividend/member"}</p>
              <p className="mt-2 text-2xl font-semibold text-primary">{formatMoney(isLakhBox ? plan.monthly_contribution : plan.fixed_dividend, plan.currency)}</p>
            </div>
          </div>

          {isCompanyMonth ? (
            <div className="bg-card rounded-2xl border border-border p-5">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <p className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-primary" /> Month 1 — {plan.company_label || "CashBox"} keeps this month's collection as income
                </p>
                <Button onClick={recordCompanyMonth} disabled={saving} className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full">
                  {saving ? "Recording…" : "Record company month"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="bg-card rounded-2xl border border-border p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Crown className="w-4 h-4 text-primary" /> Eligible members — Month {nextMonth}
                </p>
                {eligible.length > 0 && nextMonth <= plan.duration_months && (
                  <Button onClick={() => drawWinner()} className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full">
                    <Megaphone className="w-4 h-4 mr-1" /> {isLakhBox ? "Select winner" : "Lucky draw"}
                  </Button>
                )}
              </div>
              {eligible.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  {isLakhBox ? `No active member holds ticket #${nextMonth} for this month.` : "All members have won or no eligible members remain."}
                </p>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {eligible.map((m) => {
                    const prof = profileOf(m.member_profile_id);
                    return (
                      <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl border border-border">
                        <span className="w-9 h-9 rounded-full bg-primary/5 grid place-items-center text-sm font-medium text-foreground">{(prof?.full_name || "?").charAt(0)}</span>
                        <div className="min-w-0">
                          <p className="text-sm text-foreground truncate">{prof?.full_name || "Member"}</p>
                          <p className="text-xs text-muted-foreground">Ticket #{m.ticket_number}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {groupId && plan && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <p className="text-sm font-medium text-foreground flex items-center gap-2">
              <Trophy className="w-4 h-4 text-primary" /> Winner history
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/70 text-muted-foreground text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-5 py-3">Month</th>
                  <th className="text-left px-5 py-3">Winner</th>
                  <th className="text-left px-5 py-3">Announced</th>
                  <th className="text-right px-5 py-3">Prize</th>
                  <th className="text-right px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {winners?.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">No winners announced yet.</td></tr>
                )}
                {winners?.map((w) => (
                  <tr key={w.id}>
                    <td className="px-5 py-3 font-medium text-foreground">Month {w.month_number}</td>
                    <td className="px-5 py-3 text-muted-foreground">{w.member_name}</td>
                    <td className="px-5 py-3 text-muted-foreground">{w.announcement_date}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-foreground">{formatMoney(w.prize_amount, plan?.currency)}</td>
                    <td className="px-5 py-3 text-right">
                      {w.status === "paid" ? (
                        <span className={`text-xs px-2.5 py-1 rounded-full ${statusTone(w.status)}`}>{w.status}</span>
                      ) : (
                        <button onClick={() => markPaid(w)} className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 flex items-center gap-1 ml-auto">
                          <Check className="w-3 h-3" /> Mark paid
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Announce winner</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-3">
            {isLakhBox
              ? `Confirm the winner for Month ${nextMonth}. The prize (${formatMoney(Math.round(prizeAmount), plan?.currency)}) will be recorded and their membership marked as won.`
              : `Select the winner for Month ${nextMonth}. The prize (${formatMoney(Math.round(prizeAmount), plan?.currency)}) will be recorded, their membership marked as won, and ${formatMoney(plan?.fixed_dividend, plan?.currency)} dividend credited to all active members.`}
          </p>
          {selected && (() => {
            const prof = profileOf(selected);
            const ms = memberships.find((m) => m.member_profile_id === selected);
            return (
              <div className="space-y-3">
                <div className="flex flex-col items-center py-4">
                  <div className="w-16 h-16 rounded-full bg-primary/15 grid place-items-center mb-3">
                    <Crown className="w-8 h-8 text-primary" />
                  </div>
                  <p className="text-lg font-semibold text-foreground">{prof?.full_name || "Member"}</p>
                  <p className="text-sm text-muted-foreground">Ticket #{ms?.ticket_number}</p>
                </div>
                {!isLakhBox && (
                  <Button variant="outline" onClick={drawWinner} disabled={saving} className="w-full rounded-full">
                    🎲 Re-draw
                  </Button>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)} className="rounded-full">Cancel</Button>
            <Button onClick={announce} disabled={saving || !selected} className="bg-primary hover:bg-primary/90 rounded-full">{saving ? "Announcing…" : "Announce winner"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}