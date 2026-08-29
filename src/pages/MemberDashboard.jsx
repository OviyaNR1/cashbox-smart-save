import React, { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import MemberOnboardingWizard from "@/components/members/MemberOnboardingWizard";
import PayAllDialog from "@/components/members/PayAllDialog";
import { formatMoney } from "@/lib/currency";
import { getNextPaymentPreview } from "@/lib/paymentPreview";
import { ArrowRight, CreditCard, ChevronRight, XCircle, Gavel } from "lucide-react";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function MemberDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [payAllOpen, setPayAllOpen] = useState(false);
  const navigate = useNavigate();

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const me = await base44.auth.me();
      const [profiles, memberships, plans, groups, auctions, pendingPayments, planRequests] = await Promise.all([
        base44.entities.MemberProfile.filter({ user_id: me.id }),
        base44.entities.GroupMembership.filter({ user_id: me.id }),
        base44.entities.ChitPlan.list("-created_date", 100),
        base44.entities.ChitGroup.list("-created_date", 100),
        base44.entities.Auction.list("-month_number", 300),
        base44.entities.Payment.filter({ user_id: me.id, status: "pending" }),
        base44.entities.PlanRequest.filter({ user_id: me.id }),
      ]);
      setData({ me, profile: profiles[0], memberships, plans, groups, auctions, pendingPayments, planRequests });
    } catch (err) {
      setError(err.message || String(err));
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (error) return <div className="h-64 grid place-items-center text-destructive text-sm text-center px-4">Error loading dashboard: {error}</div>;
  if (!data) return <div className="h-64 grid place-items-center text-muted-foreground text-sm">Loading your dashboard…</div>;

  const { me, profile, memberships, plans, groups, auctions, pendingPayments, planRequests } = data;

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
    // "registration" means step 1 (bare account) is done but step
    // 2/3 (details + guarantor) never got confirmed — resume there, not
    // at the old single "verification" step this used to be.
    return <MemberOnboardingWizard user={me} profile={profile} startStep={2} onDone={onWizardDone} />;
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

  // "approved" requests already have a matching active membership by the
  // time an admin approves them, so only pending/rejected ones still need
  // surfacing here — otherwise a member who just submitted a request sees
  // the exact same "browse plans" empty state as someone who never applied.
  const openRequests = (planRequests || []).filter((r) => r.status !== "approved");

  // Flattens every unpaid installment across every ticket a member holds
  // (possibly several, possibly across different groups) into one list, so
  // the whole thing can be paid in a single cart-style checkout instead of
  // ticket-by-ticket. Replaces the old one-"Pay Now"-button-per-ticket-card
  // pattern, which got confusing fast once a person held multiple tickets.
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
  // How many *of the member's tickets actually have something due* — not
  // their total ticket count, which reads as "spread across all your
  // tickets" even when e.g. 2 of 3 tickets already have a payment pending
  // and only one still owes anything.
  const dueTicketCount = new Set(allDueItems.map((i) => i.membership.id)).size;

  // The dashboard previously had zero signal that an auction was actually
  // live right now — the only hint anywhere in the app was a small dot on
  // the nav menu's "Auction" item, easy to miss entirely. Surface it here
  // too: any active ticket in a live_auction-model group with a
  // not-yet-closed auction.
  const liveAuctionGroupIds = new Set(
    activeMemberships.filter((x) => x.plan?.model === "live_auction").map((x) => x.group?.id)
  );
  const openAuction = auctions.find(
    (a) => liveAuctionGroupIds.has(a.group_id) && a.status !== "closed" && a.status !== "cancelled"
  );
  const openAuctionGroup = openAuction ? groups.find((g) => g.id === openAuction.group_id) : null;

  return (
    <div className="space-y-8">
      <Header firstName={firstName} />

      {openAuction && (
        <Link
          to="/live-auction"
          className="bg-rose-500/10 rounded-2xl border border-rose-500/30 p-5 sm:p-6 flex items-center justify-between gap-4 hover:bg-rose-500/15 transition-colors animate-pulse"
        >
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-full bg-rose-500/20 grid place-items-center shrink-0">
              <Gavel className="w-5 h-5 text-rose-400" />
            </span>
            <div>
              <p className="text-sm font-semibold text-rose-400">
                Auction is live now — {openAuctionGroup?.group_name || openAuctionGroup?.group_code}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Month {openAuction.month_number} bidding is open. Tap to join.</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-rose-400 shrink-0" />
        </Link>
      )}

      {activeMemberships.length === 0 ? (
        openRequests.length > 0 ? (
          <div className="space-y-3">
            {openRequests.map((r) => (
              <div
                key={r.id}
                className={`rounded-2xl border p-5 sm:p-6 ${
                  r.status === "rejected" ? "bg-rose-500/10 border-rose-500/20" : "bg-primary/10 border-primary/20"
                }`}
              >
                <h2 className={`text-lg font-semibold ${r.status === "rejected" ? "text-rose-400" : "text-foreground"}`}>
                  {r.status === "rejected" ? "Request declined" : "Request pending admin approval"}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {r.status === "rejected"
                    ? `Your request to join "${r.plan_name}" was declined. Contact an admin for details, or browse other plans.`
                    : `Your request to join "${r.plan_name}" is awaiting admin approval. You'll be added to a group once it's reviewed.`}
                </p>
              </div>
            ))}
            <Link to="/browse-plans" className="text-sm text-primary hover:underline inline-flex items-center gap-1.5">
              Browse other plans <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        ) : (
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
        )
      ) : (
        <>
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

          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Your tickets</p>
            <div className="rounded-2xl border border-border divide-y divide-border overflow-hidden">
              {activeMemberships.map(({ membership: m, group, plan, preview }) => (
                <TicketRow
                  key={m.id}
                  membership={m}
                  group={group}
                  plan={plan}
                  preview={preview}
                  hasPending={pendingNumbersFor(m.id).size > 0}
                />
              ))}
            </div>
          </div>

          <Link
            to="/my-chits"
            className="flex items-center justify-center gap-1.5 py-3 text-sm font-medium text-primary hover:underline"
          >
            View all tickets and details <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </>
      )}

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

function Header({ firstName }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.2em] text-primary">{greeting()}</p>
      <h1 className="text-3xl font-semibold text-foreground mt-1">{firstName} 👋</h1>
    </div>
  );
}

// Compact one-line-per-ticket status row — replaces the old full-card-per-
// ticket layout, which repeated the same auction/dividend/progress detail
// (already shown on My Chits) once per ticket and got unreadable fast for
// anyone holding more than one. This just answers "does this ticket need my
// attention", with the rest a tap away on My Chits.
function TicketRow({ membership: m, group, plan, preview, hasPending }) {
  const cur = plan.currency || "INR";
  const label = group?.group_name || group?.group_code || plan.plan_name;

  let status = { text: "Paid up", tone: "text-emerald-400" };
  if (preview?.overdueCount > 0) {
    const totalDue = (preview.overdueAmount || 0) + (preview.nextInstallment || 0);
    status = { text: `Overdue · ${formatMoney(totalDue, cur)} due`, tone: "text-destructive" };
  } else if (preview?.label === "next") {
    status = { text: `Due ${preview.dueDate} · ${formatMoney(preview.nextInstallment, cur)}`, tone: "text-amber-400" };
  } else if (hasPending) {
    status = { text: "Payment pending review", tone: "text-amber-400" };
  }

  return (
    <Link to="/my-chits" className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/40 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {label}
          {m.chit_number || m.ticket_number ? ` · Chit #${m.chit_number || m.ticket_number}` : ""}
        </p>
        <p className={`text-xs mt-0.5 ${status.tone}`}>{status.text}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </Link>
  );
}
