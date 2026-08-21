import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { getCurrencyPref } from "@/lib/countryPref";
import { ArrowLeft } from "lucide-react";
import PlanRequestCard from "@/components/members/PlanRequestCard";

export default function BrowsePlans() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currencyFilter] = useState(() => getCurrencyPref());

  useEffect(() => {
    base44.entities.ChitPlan.filter({ status: "active" }).then(setPlans).finally(() => setLoading(false));
  }, []);

  const filteredPlans = currencyFilter === "all" ? plans : plans.filter((p) => (p.currency || "INR") === currencyFilter);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
        <p className="text-xs uppercase tracking-[0.2em] text-primary">Savings Plans</p>
        <h1 className="text-3xl font-semibold text-foreground mt-1">Browse Chit Plans</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Choose a plan that fits your goals. Submit a request and an admin will assign you to a group.
        </p>
      </div>

      {loading ? (
        <div className="h-48 grid place-items-center text-muted-foreground text-sm">Loading plans…</div>
      ) : filteredPlans.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-12 text-center text-sm text-muted-foreground">
          No active plans available right now. Please check back soon.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPlans.map((plan) => (
            <PlanRequestCard key={plan.id} plan={plan} />
          ))}
        </div>
      )}
    </div>
  );
}
