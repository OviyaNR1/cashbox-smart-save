import React, { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import MemberOnboardingWizard from "@/components/members/MemberOnboardingWizard";
import PayInstallmentDialog from "@/components/members/PayInstallmentDialog";
import { formatMoney } from "@/lib/currency";
import { getNextPaymentPreview } from "@/lib/paymentPreview";
import { ArrowRight, CreditCard, Gavel, Calendar, Wallet, Users, XCircle } from "lucide-react";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function MemberDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [payMembership, setPayMembership] = useState(null);
  const navigate = useNavigate();

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const me = await base44.auth.me();
      const [profiles, memberships, plans, groups, auctions, pendingPayments] = await Promise.all([
        base44.entities.MemberProfile.filter({ user_id: me.id }),
        base44.entities.GroupMembership.filter({ user_id: me.id }),
        base44.entities.ChitPlan.list("-created_date", 100),
        base44.entities.ChitGroup.list("-created_date", 100),
        base44.entities.Auction.list("-month_number", 300),
        base44.entities.Payment.filter({ user_id: me.id, status: "pending" }),
      ]);
      setData({ me, profile: profiles[0], memberships, plans, groups, auctions, pendingPayments });
    } catch (err) {
      setError(err.message || String(err));
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (error) return <div className="h-64 grid place-items-center text-destructive text-sm text-center px-4">Error loading dashboard: {error}</div>;
  if (!data) return <div className="h-64 grid place-items-center text-muted-foreground text-sm">Loading your dashboard…</div>;

  const { me, profile, memberships, plans, groups, auctions, pendingPayments } = data;

  const pendingNumbersFor = (membershipId) =>
    new Set((pendingPayments || []).filter((p) => p.membership_id === membershipId).map((p) => p.installment_number));

  // After finishing the wizard, take them straight into Browse Plans rather
  // than back to a dashboard that (for a brand-new member) has nothing to
  // show yet besides the same "browse plans" prompt.
  const onWizardDone = () => navigate("/browse-plans", { replace: true });

  if (!profile) {
    return <MemberOnboardingWizard user={me} startStep={1} onDone={onWizardDone} />;
  }
  if (profile.kyc_stage === "registration") {
    return <MemberOnboardingWizard user={me} profile={profile} startStep={3} onDone={onWizardDone} />;
  }

  const firstName = (profile.full_name || me.full_name || "there").split(" ")[0];

  if (profile.kyc_status === "rejected") {
    return (
      <div className="space-y-6">
        <Header firstName={firstName} />
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-6">
          <p className="text-sm font-semibold text-rose-400 flex items-center gap-2">
            <XCircle className="w-4 h-4" /> KYC Rejected
          </p>
          <p className="text-sm text-rose-400 mt-1">
            {profile.kyc_rejection_reason || "Please contact an admin for details on next steps."}
          </p>
        </div>
      </div>
    );
  }

  const planFor = (m) => {
    const g = groups.find((x) => x.id === m.group_id);
    return { group: g, plan: plans.find((p) => p.id === g?.plan_id) };
  };

  const activeMemberships = memberships
    .filter((m) => m.status === "active")
    .map((m) => {
      const { group, plan } = planFor(m);
      return { membership: m, group, plan, preview: plan ? getNextPaymentPreview({ membership: m, plan, group, auctions, pendingNumbers: pendingNumbersFor(m.id) }) : null };
    })
    .filter((x) => x.plan)
    .sort((a, b) => (a.preview?.dueDate || "9999").localeCompare(b.preview?.dueDate || "9999"));

  return (
    <div className="space-y-8">
      <Header firstName={firstName} />

      {activeMemberships.length === 0 ? (
        <Link
          to="/browse-plans"
          className="bg-primary/10 rounded-2xl border border-primary/20 p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-primary/15 transition-colors"
        >
          <div>
            <h2 className="text-lg font-semibold text-foreground">Looking to start saving?</h2>
            <p className="text-sm text-muted-foreground mt-1">Browse available chit plans and join a savings group today.</p>
          </div>
          <span className="shrink-0 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold flex items-center gap-2 w-full sm:w-auto justify-center">
            Browse Plans <ArrowRight className="w-4 h-4" />
          </span>
        </Link>
      ) : (
        activeMemberships.map(({ membership: m, group, plan, preview }) => (
          <GroupHero
            key={m.id}
            membership={m}
            group={group}
            plan={plan}
            preview={preview}
            auctions={auctions}
            onPay={() => setPayMembership(m)}
          />
        ))
      )}

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

function Header({ firstName }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.2em] text-primary">{greeting()}</p>
      <h1 className="text-3xl font-semibold text-foreground mt-1">{firstName} 👋</h1>
    </div>
  );
}

function GroupHero({ membership: m, group, plan, preview, auctions, onPay }) {
  const cur = plan.currency || "INR";
  const total = plan.duration_months || 0;
  const currentMonth = Math.min(group?.current_month || (m.paid_installments || 0) + 1, total || 1);
  const isLiveAuction = plan.model === "live_auction";

  const openAuction = isLiveAuction
    ? auctions.find((a) => a.group_id === group?.id && a.status !== "closed")
    : null;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">Your CashBox Group</p>
        <h2 className="text-xl font-semibold text-foreground">
          {group?.group_code || plan.plan_name} <span className="text-muted-foreground font-normal">· Month {currentMonth} of {total}</span>
        </h2>
      </div>

      {preview?.overdueCount > 0 && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-4">
          <p className="text-xs uppercase tracking-wide text-destructive/80 mb-1.5">Overdue</p>
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="text-3xl font-bold text-destructive tabular-nums">{formatMoney(preview.overdueAmount, cur)}</span>
            <span className="text-xs font-semibold text-destructive bg-destructive/15 px-2.5 py-1 rounded-full">
              {preview.overdueCount} unpaid installment{preview.overdueCount > 1 ? "s" : ""}
            </span>
          </div>
          <p className="text-xs text-destructive/80 mt-2">
            Since <span className="font-semibold text-destructive">{preview.overdueSinceDate || "an earlier month"}</span> — pay the oldest installment first to catch up.
          </p>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-card rounded-2xl border border-border p-5 flex flex-col">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Wallet className="w-4 h-4" /> <span className="text-xs uppercase tracking-wide">Next Payment</span>
          </div>
          <p className="text-2xl font-bold text-foreground tabular-nums">{formatMoney(preview?.nextInstallment, cur)}</p>
          {preview?.label !== "completed" && (
            <p className="text-xs text-muted-foreground">Installment #{group?.current_month || (m.paid_installments || 0) + 1}</p>
          )}
          <p className={`text-xs mt-1 ${preview?.overdueCount > 0 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
            {preview?.label === "completed" ? "Fully paid" : preview?.dueDate ? `Due ${preview.dueDate}` : "—"}
          </p>
          {preview?.dividendThisMonth > 0 && (
            <p className="text-xs text-emerald-400 mt-1">This month's dividend: {formatMoney(preview.dividendThisMonth, cur)}</p>
          )}
          {m.status === "active" && preview?.label !== "completed" && (
            <button
              onClick={onPay}
              className="mt-auto pt-3 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 self-start"
            >
              <CreditCard className="w-3.5 h-3.5" /> Pay Now
            </button>
          )}
        </div>

        {isLiveAuction ? (
          <Link to="/live-auction" className="bg-card rounded-2xl border border-border p-5 flex flex-col hover:border-primary/30 transition-colors">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Gavel className="w-4 h-4" /> <span className="text-xs uppercase tracking-wide">Next Auction</span>
            </div>
            <p className="text-lg font-semibold text-foreground">
              {openAuction ? `Month ${openAuction.month_number} — ${openAuction.status.replace("_", " ")}` : "Not started yet"}
            </p>
            <p className="text-xs text-primary mt-auto pt-3">View Auction →</p>
          </Link>
        ) : (
          <div className="bg-card rounded-2xl border border-border p-5 flex flex-col">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Calendar className="w-4 h-4" /> <span className="text-xs uppercase tracking-wide">Collection Day</span>
            </div>
            <p className="text-lg font-semibold text-foreground">the {group?.monthly_collection_date || 1}th</p>
            <p className="text-xs text-muted-foreground mt-auto pt-3">of every month</p>
          </div>
        )}

        <div className="bg-card rounded-2xl border border-border p-5 flex flex-col">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Wallet className="w-4 h-4" /> <span className="text-xs uppercase tracking-wide">Total Contributed</span>
          </div>
          <p className="text-2xl font-bold text-foreground tabular-nums">{formatMoney(m.total_paid || 0, cur)}</p>
          <p className="text-xs text-muted-foreground mt-1">paid in so far</p>
        </div>
      </div>

      <Link to="/my-chits" className="bg-card rounded-2xl border border-border p-4 flex items-center justify-between hover:border-primary/30 transition-colors">
        <div className="flex items-center gap-2 text-sm text-foreground">
          <Users className="w-4 h-4 text-muted-foreground" /> {plan.member_count} members · {Math.max(0, (group?.current_month || 1) - 1)} months completed
        </div>
        <span className="text-xs text-primary">View Group →</span>
      </Link>
    </div>
  );
}
