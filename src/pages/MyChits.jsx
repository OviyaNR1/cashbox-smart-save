import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { formatMoney } from "@/lib/currency";
import { generateAuctionPlan } from "@/lib/auctionEngine";
import { getNextPaymentPreview } from "@/lib/paymentPreview";
import { Trophy, CalendarClock, TrendingUp, Coins, CreditCard, Wallet } from "lucide-react";
import PayInstallmentDialog from "@/components/members/PayInstallmentDialog";

export default function MyChits() {
  const [state, setState] = useState({ loading: true });
  const [payMembership, setPayMembership] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const me = await base44.auth.me();
      const [memberships, groups, plans, winners, dividends, auctions, pendingPayments, planRequests] = await Promise.all([
        base44.entities.GroupMembership.filter({ user_id: me.id }),
        base44.entities.ChitGroup.list("-created_date", 100),
        base44.entities.ChitPlan.list("-created_date", 100),
        base44.entities.Winner.list("-created_date", 100),
        base44.entities.Dividend.filter({ user_id: me.id }, "-created_date", 100),
        base44.entities.Auction.list("-month_number", 300),
        base44.entities.Payment.filter({ user_id: me.id, status: "pending" }),
        base44.entities.PlanRequest.filter({ user_id: me.id }),
      ]);
      setState({ loading: false, data: { me, memberships, groups, plans, winners, dividends, auctions, pendingPayments, planRequests } });
    } catch (err) {
      setState({ loading: false, error: err.message || String(err) });
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (state.loading)
    return (
      <div className="h-64 grid place-items-center text-muted-foreground text-sm">
        Loading your chits…
      </div>
    );

  if (state.error)
    return (
      <div className="h-64 grid place-items-center text-destructive text-sm text-center px-4">
        Error: {state.error}
      </div>
    );

  const { memberships, groups, plans, winners, dividends, auctions, pendingPayments, planRequests } = state.data;

  const pendingNumbersFor = (membershipId) =>
    new Set((pendingPayments || []).filter((p) => p.membership_id === membershipId).map((p) => p.installment_number));

  const planFor = (m) => {
    const g = groups.find((x) => x.id === m.group_id);
    return { group: g, plan: plans.find((p) => p.id === g?.plan_id) };
  };
  const curFor = (m) => planFor(m).plan?.currency || "INR";

  const myDividendsFor = (groupId) =>
    dividends.filter((d) => d.group_id === groupId).reduce((s, d) => s + (d.amount || 0), 0);

  const myWin = (m) =>
    winners.find((w) => w.group_id === m.group_id && w.member_profile_id === m.member_profile_id);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-primary">My account</p>
        <h1 className="text-3xl font-semibold text-foreground mt-1">My Chits</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track your savings groups, prize status, and projected dividends.
        </p>
      </div>

      {memberships.length === 0 && (() => {
        const openRequests = (planRequests || []).filter((r) => r.status !== "approved");
        return openRequests.length > 0 ? (
          <div className="space-y-3">
            {openRequests.map((r) => (
              <div
                key={r.id}
                className={`rounded-2xl border p-5 text-sm ${
                  r.status === "rejected" ? "bg-rose-500/10 border-rose-500/20" : "bg-primary/10 border-primary/20"
                }`}
              >
                <p className={`font-semibold ${r.status === "rejected" ? "text-rose-400" : "text-foreground"}`}>
                  {r.status === "rejected" ? "Request declined" : "Request pending admin approval"}
                </p>
                <p className="text-muted-foreground mt-1">
                  {r.status === "rejected"
                    ? `Your request to join "${r.plan_name}" was declined. Contact an admin for details, or browse other plans.`
                    : `Your request to join "${r.plan_name}" is awaiting admin approval.`}
                </p>
              </div>
            ))}
            <Link to="/browse-plans" className="text-sm text-primary hover:underline">
              Browse other plans →
            </Link>
          </div>
        ) : (
          <div className="bg-card rounded-2xl border border-border p-8 text-center text-muted-foreground text-sm">
            You haven't joined a chit group yet.
          </div>
        );
      })()}

      {memberships.map((m) => {
        const { group, plan } = planFor(m);
        if (!plan) return null;
        const cur = curFor(m);
        const total = plan.duration_months || 0;
        const paid = m.paid_installments || 0;
        const pct = total ? Math.round((paid / total) * 100) : 0;
        const auction = plan.model === "chit_fund" ? generateAuctionPlan(plan, group) : null;
        const monthlySummary = auction?.monthlySummary || [];
        const memberLedger = auction?.memberLedger || [];
        const myLedger = memberLedger[(m.ticket_number || 1) - 1];
        const projectedPrize = myLedger?.prizeAmount;
        const projectedMonth = myLedger?.prizeMonth;
        const myPrizeRow = monthlySummary[paid];
        const dividendEarned = myDividendsFor(m.group_id);
        const winRecord = myWin(m);

        const isLiveAuction = plan.model === "live_auction";
        const preview = getNextPaymentPreview({ membership: m, plan, group, auctions, pendingNumbers: pendingNumbersFor(m.id) });

        return (
          <div key={m.id} className="bg-card rounded-2xl border border-border overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">{plan.plan_name}</p>
                <p className="text-xs text-muted-foreground">
                  {group?.group_code} · Ticket #{m.ticket_number || "—"} ·{" "}
                  {group?.status === "active" ? "Active" : group?.status}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {m.has_won && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-primary/15 text-primary flex items-center gap-1">
                    <Trophy className="w-3 h-3" /> Won
                  </span>
                )}
                {m.status === "active" && !m.has_won && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400">
                    In Progress
                  </span>
                )}
                {m.status === "active" && (
                  <button onClick={() => setPayMembership(m)} className="px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 flex items-center gap-1">
                    <CreditCard className="w-3.5 h-3.5" /> Pay Installment
                  </button>
                )}
              </div>
            </div>

            {preview.overdueCount > 0 && (
              <div className="mx-5 mt-4 bg-destructive/10 border border-destructive/20 rounded-xl p-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-lg font-bold text-destructive tabular-nums">{formatMoney(preview.overdueAmount, cur)}</span>
                <span className="text-xs font-semibold text-destructive bg-destructive/15 px-2 py-0.5 rounded-full">
                  {preview.overdueCount} unpaid installment{preview.overdueCount > 1 ? "s" : ""}
                </span>
              </div>
            )}

            {/* Summary stats */}
            <div className={`px-5 py-5 grid grid-cols-2 gap-4 ${isLiveAuction ? "md:grid-cols-5" : "md:grid-cols-4"}`}>
              <SummaryStat
                icon={Coins}
                label="Monthly Contribution"
                value={formatMoney(plan.monthly_contribution, cur)}
              />
              <SummaryStat
                icon={TrendingUp}
                label="Total Paid"
                value={formatMoney(m.total_paid || 0, cur)}
              />
              <SummaryStat
                icon={CalendarClock}
                label="Next Due"
                value={preview.dueDate || "—"}
                tone={preview.overdueCount > 0 ? "destructive" : undefined}
              />
              {isLiveAuction && (
                <SummaryStat
                  icon={Wallet}
                  label="Next Installment"
                  value={formatMoney(preview.nextInstallment, cur)}
                />
              )}
              <SummaryStat
                icon={Trophy}
                label={winRecord ? "Prize Won" : "Projected Prize"}
                value={winRecord ? formatMoney(winRecord.prize_amount, cur) : (projectedPrize ? formatMoney(projectedPrize, cur) : "—")}
              />
            </div>

            {/* Progress bar */}
            <div className="px-5 pb-5">
              <div className="flex justify-between text-xs text-muted-foreground mb-2">
                <span>
                  Progress: {paid}/{total} installments
                </span>
                <span>{pct}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            {/* Prize schedule preview */}
            {myPrizeRow && (
              <div className="px-5 py-4 bg-muted/50 border-t border-border">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Upcoming installment (Month {paid + 1})
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <PreviewRow label="Net Payment" value={formatMoney(myPrizeRow.monthlyPayment, cur)} />
                  <PreviewRow label="Dividend Share" value={formatMoney(myPrizeRow.dividendPerMember, cur)} />
                  <PreviewRow
                    label="Prize Pool"
                    value={formatMoney(myPrizeRow.winningBid, cur)}
                  />
                  <PreviewRow
                    label="Collection Date"
                    value={myPrizeRow.collectionDate || "—"}
                  />
                </div>
              </div>
            )}

            {/* Dividends earned */}
            <div className="px-5 py-3 border-t border-border flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Dividends earned this group</p>
              <p className="text-sm font-medium text-emerald-400">{formatMoney(dividendEarned, cur)}</p>
            </div>
          </div>
        );
      })}

      <PayInstallmentDialog
        open={!!payMembership}
        onOpenChange={(v) => !v && setPayMembership(null)}
        membership={payMembership}
        plan={payMembership ? planFor(payMembership).plan : null}
        group={payMembership ? planFor(payMembership).group : null}
        user={state.data?.me}
        onPaid={loadData}
      />
    </div>
  );
}

function SummaryStat({ icon: Icon, label, value, tone }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-xs">{label}</span>
      </div>
      <p className={`text-sm font-semibold tabular-nums ${tone === "destructive" ? "text-destructive" : "text-foreground"}`}>{value}</p>
    </div>
  );
}

function PreviewRow({ label, value }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground tabular-nums">{value}</p>
    </div>
  );
}