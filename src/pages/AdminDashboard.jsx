import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import StatCard from "@/components/StatCard";
import CollectionChart from "@/components/CollectionChart";
import { Users, Layers, IndianRupee, Clock, Trophy, CheckCircle2 } from "lucide-react";
import { formatMoney } from "@/lib/currency";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { useAdminCountry } from "@/lib/AdminCountryContext";

const sumByCurrency = (items, field, emptyCurrency = "INR") => {
  const totals = {};
  items.forEach((item) => {
    const cur = item.currency || "INR";
    totals[cur] = (totals[cur] || 0) + (item[field] || 0);
  });
  const entries = Object.entries(totals);
  return entries.length ? entries.map(([cur, amt]) => formatMoney(amt, cur)).join(" + ") : formatMoney(0, emptyCurrency);
};

export default function AdminDashboard() {
  const [state, setState] = useState(null);
  const navigate = useNavigate();
  // Shared with every other admin page via the header dropdown.
  const { country: countryFilter } = useAdminCountry();

  useEffect(() => {
    (async () => {
      const [profiles, groups, payments, winners, plans] = await Promise.all([
        base44.entities.MemberProfile.list("-created_date", 500),
        base44.entities.ChitGroup.list("-created_date", 200),
        base44.entities.Payment.list("-payment_date", 500),
        base44.entities.Winner.list("-announcement_date", 20),
        base44.entities.ChitPlan.list("-created_date", 200),
      ]);
      setState({ profiles, groups, payments, winners, plans });
    })();
  }, []);

  if (!state) {
    return <div className="h-64 grid place-items-center text-muted-foreground text-sm">Loading overview…</div>;
  }

  const { profiles: allProfiles, groups: allGroups, payments: allPayments, winners: allWinners, plans: allPlans } = state;

  // Filtering here once, before any aggregation runs, keeps India and
  // Canada numbers from blending into each other by default.
  const filterCurrency = countryFilter === "Canada" ? "CAD" : "INR";
  const plans = allPlans.filter((p) => (p.currency || "INR") === filterCurrency);
  const planIds = new Set(plans.map((p) => p.id));
  const groups = allGroups.filter((g) => planIds.has(g.plan_id));
  const groupIds = new Set(groups.map((g) => g.id));
  const profiles = allProfiles.filter((p) => (p.country || "India") === countryFilter);
  const payments = allPayments.filter((p) => groupIds.has(p.group_id));
  // announcement_date is a plain date (no time component), so multiple
  // winners announced the same calendar day tie on it — without a
  // secondary key, Postgres doesn't guarantee which order ties come back
  // in, which is why this list could render out of order. created_at
  // breaks the tie deterministically.
  const winners = allWinners
    .filter((w) => groupIds.has(w.group_id))
    .sort((a, b) => {
      const byDate = (b.announcement_date || "").localeCompare(a.announcement_date || "");
      return byDate !== 0 ? byDate : (b.created_at || "").localeCompare(a.created_at || "");
    });

  const success = payments.filter((p) => p.status === "success");
  const pending = payments.filter((p) => p.status === "pending");
  const totalCollectedDisplay = sumByCurrency(success, "amount", filterCurrency);
  const lateFeesDisplay = sumByCurrency(success, "late_fee", filterCurrency);
  const pendingTotalDisplay = sumByCurrency(pending, "amount", filterCurrency);
  const winnerGroup = (w) => groups.find((g) => g.id === w.group_id);
  const winnerCurrency = (w) => plans.find((p) => p.id === winnerGroup(w)?.plan_id)?.currency || "INR";

  const byMonth = {};
  success.forEach((p) => {
    const key = (p.payment_date || "").slice(0, 7);
    if (!key) return;
    byMonth[key] = (byMonth[key] || 0) + (p.amount || 0);
  });
  const chart = Object.keys(byMonth)
    .sort()
    .slice(-8)
    .map((k) => ({ month: k, amount: byMonth[k] }));

  const payoutsByMonth = {};
  winners.forEach((w) => {
    const key = (w.announcement_date || "").slice(0, 7);
    if (!key) return;
    payoutsByMonth[key] = (payoutsByMonth[key] || 0) + (w.prize_amount || 0);
  });
  const payoutChart = Object.keys(payoutsByMonth)
    .sort()
    .slice(-8)
    .map((k) => ({ month: k, amount: payoutsByMonth[k] }));

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-primary">Admin</p>
        <h1 className="text-3xl font-semibold text-foreground mt-1">Business overview</h1>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Members" value={profiles.length} icon={Users} hint={`${profiles.filter((p) => p.kyc_status === "pending").length} awaiting KYC`} onClick={() => navigate("/admin/members")} />
        <StatCard label="Active groups" value={groups.filter((g) => g.status === "active").length} icon={Layers} accent="emerald" onClick={() => navigate("/admin/groups")} />
        <StatCard label="Total collected" value={totalCollectedDisplay} icon={IndianRupee} accent="emerald" hint={`${lateFeesDisplay} late fees`} onClick={() => navigate("/admin/reports")} />
        <StatCard label="Pending payments" value={pending.length} icon={Clock} accent="gold" hint={pendingTotalDisplay} onClick={() => navigate("/admin/payments")} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <CollectionChart data={chart} />
        </div>
        <div className="bg-card rounded-2xl border border-border p-5">
          <p className="text-sm font-medium text-foreground flex items-center gap-2">
            <Trophy className="w-4 h-4 text-primary" /> Recent winners
          </p>
          <div className="mt-4 divide-y divide-border">
            {winners.length === 0 && <p className="text-sm text-muted-foreground">No winners announced yet.</p>}
            {winners.slice(0, 6).map((w) => (
              <div key={w.id} className="py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground">{w.member_name || "Member"}</p>
                  <p className="text-xs text-muted-foreground">
                    {winnerGroup(w)?.group_name || winnerGroup(w)?.group_code} · Month {w.month_number}
                  </p>
                </div>
                <span className="text-sm font-medium text-emerald-400">{formatMoney(w.prize_amount, winnerCurrency(w))}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border p-5">
        <p className="text-sm font-medium text-foreground">Prize payout trend</p>
        <p className="text-xs text-muted-foreground mb-4">Winner payouts per month, across all groups</p>
        {payoutChart.length === 0 ? (
          <div className="h-48 grid place-items-center text-sm text-muted-foreground">No payouts recorded yet.</div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={payoutChart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: "rgba(255,255,255,0.5)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "rgba(255,255,255,0.5)" }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => `₹${Number(v).toLocaleString("en-IN")}`} />
                <Bar dataKey="amount" fill="#ffb833" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <p className="text-sm font-medium text-foreground">Latest payments</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/70 text-muted-foreground text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-5 py-3">Member</th>
                <th className="text-left px-5 py-3">Transaction</th>
                <th className="text-left px-5 py-3">Date</th>
                <th className="text-left px-5 py-3">Method</th>
                <th className="text-right px-5 py-3">Amount</th>
                <th className="text-right px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payments.slice(0, 8).map((p) => (
                <tr key={p.id}>
                  <td className="px-5 py-3 text-foreground">
                    {profiles.find((m) => m.id === p.member_profile_id)?.full_name || "—"}
                  </td>
                  <td className="px-5 py-3 text-foreground">{p.transaction_id || p.id.slice(0, 8)}</td>
                  <td className="px-5 py-3 text-muted-foreground">{p.payment_date || "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground capitalize">{(p.method || "").replace("_", " ")}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{formatMoney(p.amount, p.currency || "INR")}</td>
                  <td className="px-5 py-3 text-right">
                    <span className={`text-xs px-2.5 py-1 rounded-full ${
                      p.status === "success" ? "bg-emerald-500/15 text-emerald-400" : p.status === "pending" ? "bg-amber-500/15 text-amber-400" : "bg-rose-500/15 text-rose-400"
                    }`}>{p.status}</span>
                  </td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">No payments recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}