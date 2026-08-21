import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { formatMoney } from "@/lib/currency";
import { usePublicCurrency } from "@/lib/publicCurrency";
import { ArrowRight, Loader2 } from "lucide-react";

export default function Plans() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);
  const { currency } = usePublicCurrency();

  useEffect(() => {
    base44.entities.ChitPlan.filter({ status: "active" }).then(setPlans).finally(() => setLoading(false));
    base44.auth.isAuthenticated().then(setAuthed).catch(() => setAuthed(false));
  }, []);

  const filteredPlans = currency === "all" ? plans : plans.filter((p) => (p.currency || "INR") === currency);

  return (
    <div>
      <section className="bg-card text-foreground py-16">
        <div className="max-w-7xl mx-auto px-5 text-center">
          <h1 className="text-4xl md:text-5xl font-bold">Chit Plans</h1>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
            Choose a plan that fits your financial goals. Every plan is transparent, community-driven,
            and designed to help you save consistently.
          </p>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-7xl mx-auto px-5">
          {loading ? (
            <div className="h-48 grid place-items-center">
              <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
            </div>
          ) : filteredPlans.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">No active plans available right now. Please check back soon.</div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredPlans.map((p) => <PlanCard key={p.id} plan={p} authed={authed} />)}
            </div>
          )}
        </div>
      </section>

      <section className="bg-muted/30 py-16">
        <div className="max-w-4xl mx-auto px-5 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground">Don't see the right plan?</h2>
          <p className="mt-3 text-muted-foreground">New plans are added regularly. Register today and we'll notify you when a group opens up.</p>
          <Link to="/register" className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors">
            Create your free account <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}

function PlanCard({ plan, authed }) {
  const currency = plan.currency || "INR";
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden hover:border-primary/30 transition-all">
      <div className="bg-card border-b border-border px-6 py-4 flex items-center justify-between">
        <h3 className="font-semibold text-foreground">{plan.plan_name}</h3>
        <span className="text-xs px-2 py-1 rounded-full bg-primary/20 text-primary font-medium">{currency}</span>
      </div>
      <div className="p-6">
        <div className="text-4xl font-bold text-primary">{formatMoney(plan.chit_amount, currency)}</div>
        <p className="text-sm text-muted-foreground mt-1">Total prize amount</p>
        <div className="mt-6 space-y-3">
          <Row label="Monthly Contribution" value={formatMoney(plan.monthly_contribution, currency)} />
          <Row label="Duration" value={`${plan.duration_months} months`} />
          <Row label="Group Size" value={`${plan.member_count} members`} />
          {plan.fixed_dividend ? <Row label="Fixed Dividend" value={formatMoney(plan.fixed_dividend, currency)} /> : null}
        </div>
        <Link to={authed ? "/browse-plans" : "/register"} className="mt-6 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
          {authed ? "Join this plan" : "Register to join"} <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between text-sm border-b border-border/50 pb-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}