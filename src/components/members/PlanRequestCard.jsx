import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { formatMoney } from "@/lib/currency";
import { logAudit } from "@/lib/audit";
import { Users, Calendar, Coins, Check, Loader2, UserPlus } from "lucide-react";

// Where a "new plan request" WhatsApp alert goes. No admin-settings UI
// exists yet for this, so it's a plain constant — change it here, or ask
// for a settings field if you want it editable in the app itself.
const ADMIN_NOTIFY_PHONE = "+14163037369";

// Shared by BrowsePlans.jsx and the onboarding wizard's "Join your Chit"
// step. Pass `user`/`memberProfile` when the caller already has them (the
// wizard does, right after Step 1) to skip the redundant self-fetch;
// omitted, the card fetches them itself exactly like BrowsePlans.jsx always
// has.
export default function PlanRequestCard({ plan, user: userProp, memberProfile: memberProfileProp }) {
  const currency = plan.currency || "INR";
  const [user, setUser] = useState(userProp || null);
  const [memberProfile, setMemberProfile] = useState(memberProfileProp || null);
  const [existingRequest, setExistingRequest] = useState(null);
  const [alreadyMember, setAlreadyMember] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [profileChecked, setProfileChecked] = useState(!!memberProfileProp);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const withUser = userProp ? Promise.resolve(userProp) : base44.auth.me();
    withUser.then((u) => {
      setUser(u);
      if (memberProfileProp) return [memberProfileProp];
      return base44.entities.MemberProfile.filter({ user_id: u.id });
    }).then((profiles) => {
      const profile = memberProfileProp || profiles[0];
      setMemberProfile(profile);
      setProfileChecked(true);
      if (!profile) return null;
      return Promise.all([
        base44.entities.PlanRequest.filter({ member_profile_id: profile.id, plan_id: plan.id }),
        base44.entities.GroupMembership.filter({ member_profile_id: profile.id, status: "active" }),
        base44.entities.ChitGroup.filter({ plan_id: plan.id }),
      ]);
    }).then((result) => {
      if (!result) return;
      const [reqs, memberships, groupsForPlan] = result;
      if (reqs && reqs.length > 0) setExistingRequest(reqs[0]);
      const groupIds = new Set((groupsForPlan || []).map((g) => g.id));
      if ((memberships || []).some((m) => groupIds.has(m.group_id))) setAlreadyMember(true);
    }).catch(() => setProfileChecked(true));
  }, [plan.id, userProp, memberProfileProp]);

  const handleChoose = async () => {
    setSubmitting(true);
    setError("");
    try {
      const req = await base44.entities.PlanRequest.create({
        user_id: user?.id,
        member_profile_id: memberProfile?.id,
        plan_id: plan.id,
        plan_name: plan.plan_name,
        currency: currency,
        status: "pending"
      });
      logAudit({ module: "Members", action: "plan-request", record_id: req.id, details: `${memberProfile?.full_name || "Member"} requested to join "${plan.plan_name}"` });
      const message = `New plan request: ${memberProfile?.full_name || "A member"} wants to join "${plan.plan_name}". Review it in Plan Requests.`;
      base44.functions.invoke("sendWhatsApp", { phone: ADMIN_NOTIFY_PHONE, message }).catch((err) => {
        console.error("Admin WhatsApp notification failed:", err);
        logAudit({ module: "Members", action: "whatsapp-notify-failed", record_id: req.id, details: `Failed to WhatsApp-notify admin of "${plan.plan_name}" request: ${err?.message || err}` });
      });
      setExistingRequest(req);
      setConfirming(false);
    } catch (e) {
      setError("Could not submit request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden hover:border-primary/30 transition-all flex flex-col">
      <div className="bg-card border-b border-border px-5 py-3 flex items-center justify-between">
        <h3 className="font-semibold text-foreground">{plan.plan_name}</h3>
        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium">{currency}</span>
      </div>
      <div className="p-5 flex-1 flex flex-col">
        <div className="text-3xl font-bold text-primary">{formatMoney(plan.chit_amount, currency)}</div>
        <p className="text-xs text-muted-foreground mt-0.5">Total prize amount</p>
        <div className="mt-5 space-y-2.5">
          <DetailRow icon={Coins} label="Monthly" value={formatMoney(plan.monthly_contribution, currency)} />
          <DetailRow icon={Calendar} label="Duration" value={`${plan.duration_months} months`} />
          <DetailRow icon={Users} label="Group Size" value={`${plan.member_count} members`} />
          {plan.fixed_dividend ? <DetailRow label="Fixed Dividend" value={formatMoney(plan.fixed_dividend, currency)} /> : null}
        </div>
        <div className="mt-5 pt-1">
          {profileChecked && !memberProfile ? (
            <Link
              to="/dashboard"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/20"
            >
              <UserPlus className="w-4 h-4" /> Complete onboarding first
            </Link>
          ) : !profileChecked ? (
            <div className="w-full py-2.5 rounded-lg bg-muted animate-pulse" />
          ) : alreadyMember ? (
            <div className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-emerald-500/10 text-emerald-500 text-sm font-medium">
              <Check className="w-4 h-4" /> You're already a member of this plan
            </div>
          ) : existingRequest ? (
            <div className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-primary/10 text-primary text-sm font-medium">
              <Check className="w-4 h-4" />
              {existingRequest.status === "approved"
                ? "Approved — you've been added to a group"
                : existingRequest.status === "rejected"
                ? "Your request was declined — contact an admin"
                : "Request submitted — awaiting admin approval"}
            </div>
          ) : confirming ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
                You're requesting to join <span className="font-semibold text-foreground">{plan.plan_name}</span> — a {plan.duration_months}-month commitment at {formatMoney(plan.monthly_contribution, currency)}/month. An admin will review your request and assign you to a group.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setConfirming(false)} className="flex-1 px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted">Cancel</button>
                <button onClick={handleChoose} disabled={submitting} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60">
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : "Confirm & Request"}
                </button>
              </div>
              {error && <p className="text-xs text-destructive text-center">{error}</p>}
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90"
            >
              Choose This Plan
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5" />} {label}
      </span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
