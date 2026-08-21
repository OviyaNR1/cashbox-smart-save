import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { formatMoney } from "@/lib/currency";
import { Coins, TrendingUp } from "lucide-react";

export default function MyDividends() {
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    (async () => {
      try {
        const me = await base44.auth.me();
        const [dividends, memberships, groups, plans] = await Promise.all([
          base44.entities.Dividend.filter({ user_id: me.id }, "-created_date", 100),
          base44.entities.GroupMembership.filter({ user_id: me.id }),
          base44.entities.ChitGroup.list("-created_date", 100),
          base44.entities.ChitPlan.list("-created_date", 100),
        ]);
        setState({ loading: false, data: { dividends, memberships, groups, plans } });
      } catch (err) {
        setState({ loading: false, error: err.message || String(err) });
      }
    })();
  }, []);

  if (state.loading)
    return (
      <div className="h-64 grid place-items-center text-muted-foreground text-sm">
        Loading your dividends…
      </div>
    );

  if (state.error)
    return (
      <div className="h-64 grid place-items-center text-destructive text-sm text-center px-4">
        Error: {state.error}
      </div>
    );

  const { dividends, memberships, groups, plans } = state.data;

  const planFor = (groupId) => {
    const ms = memberships.find((m) => m.group_id === groupId);
    const g = groups.find((x) => x.id === groupId);
    return plans.find((p) => p.id === g?.plan_id);
  };
  const curFor = (groupId) => planFor(groupId)?.currency || "INR";

  const byGroup = {};
  dividends.forEach((d) => {
    if (!byGroup[d.group_id]) byGroup[d.group_id] = [];
    byGroup[d.group_id].push(d);
  });

  const grandTotal = {};
  Object.entries(byGroup).forEach(([gid, items]) => {
    const cur = curFor(gid);
    grandTotal[cur] = (grandTotal[cur] || 0) + items.reduce((s, d) => s + (d.amount || 0), 0);
  });
  const fallbackCur = memberships.length ? curFor(memberships[0].group_id) : "INR";
  const totalDisplay = Object.keys(grandTotal).length
    ? Object.entries(grandTotal).map(([cur, amt]) => formatMoney(amt, cur)).join(" + ")
    : formatMoney(0, fallbackCur);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-primary">My account</p>
        <h1 className="text-3xl font-semibold text-foreground mt-1">My Dividends</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Total earned: <span className="font-medium text-emerald-400">{totalDisplay}</span>
        </p>
      </div>

      <div className="bg-gradient-to-br from-card to-muted rounded-2xl p-6 border border-border">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total dividend earnings</p>
            <p className="text-2xl font-bold text-foreground">{totalDisplay}</p>
          </div>
        </div>
      </div>

      {dividends.length === 0 && (
        <div className="bg-card rounded-2xl border border-border p-8 text-center text-muted-foreground text-sm">
          No dividends credited yet.
        </div>
      )}

      {Object.entries(byGroup).map(([groupId, items]) => {
        const plan = planFor(groupId);
        const group = groups.find((g) => g.id === groupId);
        const cur = curFor(groupId);
        const groupTotal = items.reduce((s, d) => s + (d.amount || 0), 0);

        return (
          <div key={groupId} className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">{plan?.plan_name || "Chit plan"}</p>
                <p className="text-xs text-muted-foreground">{group?.group_code || "—"}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-emerald-400 tabular-nums">
                  {formatMoney(groupTotal, cur)}
                </p>
                <p className="text-xs text-muted-foreground">{items.length} credits</p>
              </div>
            </div>
            <div className="divide-y divide-border">
              {items.map((d) => (
                <div key={d.id} className="px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                      <Coins className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-sm text-foreground">Month {d.month_number || "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        {d.status === "credited" ? "Credited" : "Pending"}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm font-medium text-foreground tabular-nums">
                    +{formatMoney(d.amount, cur)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}