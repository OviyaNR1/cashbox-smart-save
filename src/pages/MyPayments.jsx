import React, { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { FileText, CreditCard } from "lucide-react";
import { formatMoney } from "@/lib/currency";
import PayInstallmentDialog from "@/components/members/PayInstallmentDialog";

const statusTone = (s) => s === "success" ? "bg-emerald-500/15 text-emerald-400" : s === "pending" ? "bg-amber-500/15 text-amber-400" : "bg-rose-500/15 text-rose-400";

export default function MyPayments() {
  const [data, setData] = useState(null);
  const [payMembership, setPayMembership] = useState(null);

  const loadData = useCallback(async () => {
    const me = await base44.auth.me();
    const [payments, memberships, groups, plans] = await Promise.all([
      base44.entities.Payment.filter({ user_id: me.id }, "-payment_date", 100),
      base44.entities.GroupMembership.filter({ user_id: me.id }),
      base44.entities.ChitGroup.list("-created_date", 100),
      base44.entities.ChitPlan.list("-created_date", 100),
    ]);
    setData({ me, payments, memberships, groups, plans });
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (!data) return <div className="h-64 grid place-items-center text-muted-foreground text-sm">Loading…</div>;
  const { me, payments, memberships, groups, plans } = data;

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

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-primary">My account</p>
        <h1 className="text-3xl font-semibold text-foreground mt-1">Payments & receipts</h1>
        <p className="text-sm text-muted-foreground mt-1">Total paid: <span className="font-medium text-emerald-400">{totalPaidDisplay}</span></p>
      </div>

      <div className="space-y-4">
        {memberships.map((m) => {
          const { plan, group } = planFor(m);
          const msPays = payments.filter((p) => p.membership_id === m.id);
          const total = plan?.duration_months || 0;
          const pct = total ? Math.round(((m.paid_installments || 0) / total) * 100) : 0;
          return (
            <div key={m.id} className="bg-card rounded-2xl border border-border overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">{plan?.plan_name || "Chit plan"}</p>
                  <p className="text-xs text-muted-foreground">{group?.group_name || group?.group_code} · {m.paid_installments}/{total} installments</p>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setPayMembership(m)} className="px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 flex items-center gap-1">
                    <CreditCard className="w-3.5 h-3.5" /> Pay Installment
                  </button>
                  <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
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

      <PayInstallmentDialog
        open={!!payMembership}
        onOpenChange={(v) => !v && setPayMembership(null)}
        membership={payMembership}
        plan={payMembership ? planFor(payMembership).plan : null}
        group={payMembership ? planFor(payMembership).group : null}
        user={me}
        onPaid={loadData}
      />
    </div>
  );
}