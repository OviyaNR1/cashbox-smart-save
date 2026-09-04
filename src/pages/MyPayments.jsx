import React, { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { FileText, CreditCard } from "lucide-react";
import { formatMoney } from "@/lib/currency";
import { getNextPaymentPreview } from "@/lib/paymentPreview";
import PayAllDialog from "@/components/members/PayAllDialog";

const statusTone = (s) => s === "success" ? "bg-emerald-500/15 text-emerald-400" : s === "pending" ? "bg-amber-500/15 text-amber-400" : "bg-rose-500/15 text-rose-400";

export default function MyPayments() {
  const [data, setData] = useState(null);
  const [payAllOpen, setPayAllOpen] = useState(false);

  const loadData = useCallback(async () => {
    const me = await base44.auth.me();
    const [payments, memberships, groups, plans, auctions] = await Promise.all([
      base44.entities.Payment.filter({ user_id: me.id }, "-payment_date", 100),
      base44.entities.GroupMembership.filter({ user_id: me.id }),
      base44.entities.ChitGroup.list("-created_date", 100),
      base44.entities.ChitPlan.list("-created_date", 100),
      base44.entities.Auction.list("-month_number", 300),
    ]);
    setData({ me, payments, memberships, groups, plans, auctions });
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (!data) return <div className="h-64 grid place-items-center text-muted-foreground text-sm">Loading…</div>;
  const { me, payments, memberships, groups, plans, auctions } = data;

  const planFor = (m) => {
    const g = groups.find((x) => x.id === m?.group_id);
    return { group: g, plan: plans.find((p) => p.id === g?.plan_id) };
  };
  const curForMs = (m) => planFor(m).plan?.currency || "INR";
  const msForPay = (p) => memberships.find((m) => m.id === p.membership_id);
  const payCur = (p) => p.currency || (msForPay(p) ? curForMs(msForPay(p)) : "INR");

  const successPays = payments.filter((p) => p.status === "success");
  const totalsByCur = {};
  successPays.forEach((p) => {
    const cur = payCur(p);
    totalsByCur[cur] = (totalsByCur[cur] || 0) + (p.amount || 0);
  });
  const fallbackCur = memberships.length ? curForMs(memberships[0]) : "INR";
  const totalPaidDisplay = Object.keys(totalsByCur).length
    ? Object.entries(totalsByCur).map(([cur, amt]) => formatMoney(amt, cur)).join(" + ")
    : formatMoney(0, fallbackCur);

  // Same "flatten every unpaid installment across every ticket into one
  // cart" pattern as MemberDashboard.jsx's Total Due — this page used to
  // show each ticket's own separate amount due with its own separate "Pay
  // Installment" button and no combined total anywhere, which read as
  // "5000 and 5000" instead of "10000" for a multi-ticket member.
  const pendingNumbersFor = (membershipId) =>
    new Set(payments.filter((p) => p.membership_id === membershipId && p.status === "pending").map((p) => p.installment_number));
  const activeMemberships = memberships
    .filter((m) => m.status === "active")
    .map((m) => {
      const { group, plan } = planFor(m);
      return { membership: m, group, plan, preview: plan ? getNextPaymentPreview({ membership: m, plan, group, auctions, pendingNumbers: pendingNumbersFor(m.id) }) : null };
    });
  const allDueItems = activeMemberships.flatMap(({ membership, group, plan, preview }) =>
    (preview?.unpaidInstallments || []).map((item) => ({
      key: `${membership.id}-${item.number}`,
      membership,
      group,
      plan,
      currency: plan.currency || "INR",
      ...item,
    }))
  );
  const dueTotalsByCurrency = {};
  allDueItems.forEach((i) => {
    dueTotalsByCurrency[i.currency] = (dueTotalsByCurrency[i.currency] || 0) + i.amount;
  });
  const dueTotalDisplay = Object.keys(dueTotalsByCurrency).length
    ? Object.entries(dueTotalsByCurrency).map(([c, amt]) => formatMoney(amt, c)).join(" + ")
    : formatMoney(0, "INR");
  const dueTicketCount = new Set(allDueItems.map((i) => i.membership.id)).size;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-primary">My account</p>
        <h1 className="text-3xl font-semibold text-foreground mt-1">Payments & receipts</h1>
        <p className="text-sm text-muted-foreground mt-1">Total paid: <span className="font-medium text-emerald-400">{totalPaidDisplay}</span></p>
      </div>

      {allDueItems.length > 0 && (
        <div className="bg-primary/10 rounded-2xl border border-primary/20 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-primary/80">Total Due</p>
            <p className="text-3xl font-bold text-foreground tabular-nums mt-1">{dueTotalDisplay}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {allDueItems.length} installment{allDueItems.length > 1 ? "s" : ""}
              {dueTicketCount > 1 ? ` across ${dueTicketCount} tickets` : ""}
            </p>
          </div>
          <button
            onClick={() => setPayAllOpen(true)}
            className="shrink-0 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90"
          >
            <CreditCard className="w-4 h-4" /> Pay Now
          </button>
        </div>
      )}

      <div className="space-y-4">
        {memberships.map((m) => {
          const { plan, group } = planFor(m);
          const msPays = payments.filter((p) => p.membership_id === m.id);
          const total = plan?.duration_months || 0;
          const pct = total ? Math.round(((m.paid_installments || 0) / total) * 100) : 0;
          return (
            <div key={m.id} className="bg-card rounded-2xl border border-border overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{plan?.plan_name || "Chit plan"}</p>
                  <p className="text-xs text-muted-foreground">
                    {group?.group_name || group?.group_code} · Chit #{m.chit_number || m.ticket_number || "—"} · {m.paid_installments}/{total} installments
                  </p>
                </div>
                <div className="w-24 h-2 rounded-full bg-muted overflow-hidden shrink-0">
                  <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="divide-y divide-border">
                {msPays.length === 0 && <p className="px-5 py-6 text-center text-sm text-muted-foreground">No payments for this group yet.</p>}
                {msPays.map((p) => (
                  <div key={p.id} className="px-5 py-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-foreground">Installment {p.installment_number || "—"}</p>
                      <p className="text-xs text-muted-foreground">{p.payment_date || "—"} · {(p.method || "").replace("_", " ")}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm tabular-nums text-foreground">{formatMoney(p.amount, payCur(p))}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${statusTone(p.status)}`}>{p.status}</span>
                      </div>
                      {p.status === "success" && (
                        <Link to={`/receipt/${p.id}`} className="p-2 rounded-lg hover:bg-muted text-muted-foreground" title="Receipt">
                          <FileText className="w-4 h-4" />
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {memberships.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">You haven't joined a chit group yet.</p>
        )}
      </div>

      <PayAllDialog
        open={payAllOpen}
        onOpenChange={setPayAllOpen}
        items={allDueItems}
        user={me}
        onPaid={loadData}
      />
    </div>
  );
}