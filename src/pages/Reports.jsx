import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { downloadCSV } from "@/lib/csv";
import { downloadExcel } from "@/lib/excel";
import { BarChart3, Users, IndianRupee, Download, TrendingUp, AlertTriangle } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { formatMoney } from "@/lib/currency";
import { useAdminCountry } from "@/lib/AdminCountryContext";

const sumByCurrency = (items, field, getCur, emptyCurrency = "INR") => {
  const totals = {};
  items.forEach((item) => {
    const cur = getCur ? getCur(item) : (item.currency || "INR");
    totals[cur] = (totals[cur] || 0) + (item[field] || 0);
  });
  const entries = Object.entries(totals);
  return entries.length ? entries.map(([cur, amt]) => formatMoney(amt, cur)).join(" + ") : formatMoney(0, emptyCurrency);
};

export default function Reports() {
  const [data, setData] = useState(null);
  // Shared with every other admin page via the header dropdown.
  const { country: countryFilter } = useAdminCountry();

  useEffect(() => {
    (async () => {
      const [profiles, groups, plans, payments, memberships, winners, dividends] = await Promise.all([
        base44.entities.MemberProfile.list("-created_date", 500),
        base44.entities.ChitGroup.list("-created_date", 200),
        base44.entities.ChitPlan.list("-created_date", 100),
        base44.entities.Payment.list("-payment_date", 500),
        base44.entities.GroupMembership.list("-created_date", 500),
        base44.entities.Winner.list("-announcement_date", 200),
        base44.entities.Dividend.list("-created_date", 500),
      ]);
      setData({ profiles, groups, plans, payments, memberships, winners, dividends });
    })();
  }, []);

  if (!data) {
    return <div className="h-64 grid place-items-center text-muted-foreground text-sm">Loading reports…</div>;
  }

  const {
    profiles: allProfiles, groups: allGroups, plans: allPlans,
    payments: allPayments, memberships: allMemberships, winners: allWinners, dividends: allDividends,
  } = data;

  // Every stat/chart/table below is derived from these — filtering here
  // once, before any aggregation runs, keeps India and Canada numbers from
  // blending into each other without touching each calculation separately.
  const filterCurrency = countryFilter === "Canada" ? "CAD" : "INR";
  const plans = allPlans.filter((p) => (p.currency || "INR") === filterCurrency);
  const planIds = new Set(plans.map((p) => p.id));
  const groups = allGroups.filter((g) => planIds.has(g.plan_id));
  const groupIds = new Set(groups.map((g) => g.id));
  const profiles = allProfiles.filter((p) => (p.country || "India") === countryFilter);
  const payments = allPayments.filter((p) => groupIds.has(p.group_id));
  const memberships = allMemberships.filter((m) => groupIds.has(m.group_id));
  const winners = allWinners.filter((w) => groupIds.has(w.group_id));
  const dividends = allDividends.filter((d) => groupIds.has(d.group_id));

  const success = payments.filter((p) => p.status === "success");
  const planCurForGroup = (gid) => {
    const grp = groups.find((g) => g.id === gid);
    return plans.find((p) => p.id === grp?.plan_id)?.currency || "INR";
  };
  const totalCollected = sumByCurrency(success, "amount", null, filterCurrency);
  const totalLateFees = sumByCurrency(success, "late_fee", null, filterCurrency);
  const totalPrizes = sumByCurrency(winners, "prize_amount", (w) => planCurForGroup(w.group_id), filterCurrency);
  const totalDividends = sumByCurrency(dividends, "amount", (d) => planCurForGroup(d.group_id), filterCurrency);

  const commByCur = {};
  winners.forEach((w) => {
    const grp = groups.find((g) => g.id === w.group_id);
    const plan = plans.find((p) => p.id === grp?.plan_id);
    if (!plan || plan.model === "lakhbox") return; // CashBox Rotation has no commission concept
    const cur = plan.currency || "INR";
    commByCur[cur] = (commByCur[cur] || 0) + (plan.chit_amount - (w.prize_amount || 0));
  });
  const commissionRevenue = Object.entries(commByCur).length
    ? Object.entries(commByCur).map(([cur, amt]) => formatMoney(amt, cur)).join(" + ")
    : formatMoney(0, filterCurrency);

  const outByCur = {};
  memberships.forEach((m) => {
    const grp = groups.find((g) => g.id === m.group_id);
    const plan = plans.find((p) => p.id === grp?.plan_id);
    if (!plan) return;
    const cur = plan.currency || "INR";
    const remaining = Math.max(0, plan.duration_months - (m.paid_installments || 0));
    outByCur[cur] = (outByCur[cur] || 0) + remaining * plan.monthly_contribution;
  });
  const outstanding = Object.entries(outByCur).length
    ? Object.entries(outByCur).map(([cur, amt]) => formatMoney(amt, cur)).join(" + ")
    : formatMoney(0, filterCurrency);

  const byGroup = {};
  success.forEach((p) => {
    byGroup[p.group_id] = (byGroup[p.group_id] || 0) + (p.amount || 0);
  });
  const groupChart = groups
    .map((g) => ({ name: g.group_code, collected: byGroup[g.id] || 0 }))
    .sort((a, b) => b.collected - a.collected)
    .slice(0, 8);

  const memberReport = profiles.map((p) => {
    const ms = memberships.filter((m) => m.member_profile_id === p.id);
    const won = ms.some((m) => m.has_won);
    const totalPaid = ms.reduce((s, m) => s + (m.total_paid || 0), 0);
    const currency = ms.length ? planCurForGroup(ms[0].group_id) : "INR";
    return {
      member_code: p.member_code || "",
      name: p.full_name,
      mobile: p.mobile || "",
      kyc_status: p.kyc_status,
      groups: ms.length,
      has_won: won ? "Yes" : "No",
      total_paid: totalPaid,
      currency,
    };
  });

  const dividendAudit = [];
  groups.forEach((g) => {
    const plan = plans.find((p) => p.id === g.plan_id);
    if (!plan) return;
    const grpMembers = memberships.filter((m) => m.group_id === g.id && m.status === "active");
    const grpDivs = dividends.filter((d) => d.group_id === g.id);
    const months = [...new Set(grpDivs.map((d) => d.month_number))].sort((a, b) => a - b);
    months.forEach((mo) => {
      const expected = grpMembers.length;
      const monthDivs = grpDivs.filter((d) => d.month_number === mo);
      const distinctMembers = new Set(monthDivs.map((d) => d.member_profile_id)).size;
      const status = distinctMembers === expected ? "OK" : distinctMembers > expected ? "Over-count" : "Shortfall";
      dividendAudit.push({ group: g.group_code, month: mo, expected, actual: distinctMembers, status });
    });
  });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-primary">Admin</p>
          <h1 className="text-3xl font-semibold text-foreground mt-1">Reports & analytics</h1>
        </div>
      </div>

      <section>
        <div className="flex items-center gap-2 mb-4">
          <IndianRupee className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-medium text-foreground">Financial health</h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-card rounded-2xl border border-border p-5">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Total collected</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{totalCollected}</p>
            <p className="text-xs text-muted-foreground mt-1">{totalLateFees} late fees</p>
          </div>
          <div className="bg-card rounded-2xl border border-border p-5">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Commission revenue</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-400">{commissionRevenue}</p>
            <p className="text-xs text-muted-foreground mt-1">from {winners.length} winners</p>
          </div>
          <div className="bg-card rounded-2xl border border-border p-5">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Prizes disbursed</p>
            <p className="mt-2 text-2xl font-semibold text-primary">{totalPrizes}</p>
            <p className="text-xs text-muted-foreground mt-1">{totalDividends} dividends</p>
          </div>
          <div className="bg-card rounded-2xl border border-border p-5">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Outstanding liability</p>
            <p className="mt-2 text-2xl font-semibold text-rose-400">{outstanding}</p>
            <p className="text-xs text-muted-foreground mt-1">unpaid installments</p>
          </div>
        </div>
      </section>

      <section className="bg-card rounded-2xl border border-border p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-foreground" />
          <h2 className="text-sm font-medium text-foreground">Collections by group</h2>
        </div>
        {groupChart.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No payment data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={groupChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "rgba(255,255,255,0.5)" }} />
              <YAxis tick={{ fontSize: 12, fill: "rgba(255,255,255,0.5)" }} tickFormatter={(v) => `${v / 1000}k`} />
              <Tooltip formatter={(v) => formatMoney(v)} />
              <Bar dataKey="collected" fill="#ffb833" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>

      <section className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-foreground" />
            <h2 className="text-sm font-medium text-foreground">Member status report</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadCSV(`members_${new Date().toISOString().slice(0, 10)}.csv`, memberReport)}
              className="text-xs px-3 py-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            <button
              onClick={() => downloadExcel(`members_${new Date().toISOString().slice(0, 10)}.xlsx`, memberReport)}
              className="text-xs px-3 py-1.5 rounded-full bg-muted text-foreground hover:bg-muted/70 flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Excel
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/70 text-muted-foreground text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-5 py-3">Code</th>
                <th className="text-left px-5 py-3">Name</th>
                <th className="text-left px-5 py-3">Mobile</th>
                <th className="text-left px-5 py-3">KYC</th>
                <th className="text-right px-5 py-3">Groups</th>
                <th className="text-center px-5 py-3">Won</th>
                <th className="text-right px-5 py-3">Total paid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {memberReport.slice(0, 15).map((m) => (
                <tr key={m.member_code || m.name}>
                  <td className="px-5 py-3 text-muted-foreground">{m.member_code || "—"}</td>
                  <td className="px-5 py-3 text-foreground">{m.name}</td>
                  <td className="px-5 py-3 text-muted-foreground">{m.mobile || "—"}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      m.kyc_status === "approved" ? "bg-emerald-500/15 text-emerald-400" : m.kyc_status === "rejected" ? "bg-rose-500/15 text-rose-400" : "bg-amber-500/15 text-amber-400"
                    }`}>{m.kyc_status}</span>
                  </td>
                  <td className="px-5 py-3 text-right text-muted-foreground">{m.groups}</td>
                  <td className="px-5 py-3 text-center text-muted-foreground">{m.has_won}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-foreground">{formatMoney(m.total_paid, m.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {memberReport.length > 15 && (
            <p className="px-5 py-3 text-xs text-muted-foreground">Showing 15 of {memberReport.length} members — export CSV for full list.</p>
          )}
        </div>
      </section>

      <section className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-foreground" />
            <h2 className="text-sm font-medium text-foreground">Dividend audit</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadCSV(`dividend_audit_${new Date().toISOString().slice(0, 10)}.csv`, dividendAudit)}
              className="text-xs px-3 py-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            <button
              onClick={() => downloadExcel(`dividend_audit_${new Date().toISOString().slice(0, 10)}.xlsx`, dividendAudit)}
              className="text-xs px-3 py-1.5 rounded-full bg-muted text-foreground hover:bg-muted/70 flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Excel
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/70 text-muted-foreground text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-5 py-3">Group</th>
                <th className="text-left px-5 py-3">Month</th>
                <th className="text-right px-5 py-3">Expected</th>
                <th className="text-right px-5 py-3">Actual</th>
                <th className="text-center px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {dividendAudit.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">No dividend records to audit.</td></tr>
              )}
              {dividendAudit.map((r, i) => (
                <tr key={i}>
                  <td className="px-5 py-3 text-foreground">{r.group}</td>
                  <td className="px-5 py-3 text-muted-foreground">Month {r.month}</td>
                  <td className="px-5 py-3 text-right text-muted-foreground">{r.expected}</td>
                  <td className="px-5 py-3 text-right text-muted-foreground">{r.actual}</td>
                  <td className="px-5 py-3 text-center">
                    {r.status === "OK" ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">OK</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 flex items-center gap-1 justify-center">
                        <AlertTriangle className="w-3 h-3" /> Shortfall
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}