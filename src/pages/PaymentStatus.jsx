import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { useAdminCountry } from "@/lib/AdminCountryContext";

// A member-by-member roster of who's paid the current month and who
// hasn't — nothing in the admin app answered "who is still pending" as a
// standalone view before this; Payments.jsx only lists payments that
// already exist, so a member with zero payment record was invisible there.
export default function PaymentStatus() {
  const { country: countryFilter } = useAdminCountry();
  const [groups, setGroups] = useState([]);
  const [plans, setPlans] = useState([]);
  const [groupId, setGroupId] = useState("");
  const [memberships, setMemberships] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    base44.entities.ChitGroup.list("-created_date", 200).then(setGroups);
    base44.entities.ChitPlan.list("-created_date", 200).then(setPlans);
  }, []);

  const group = groups.find((g) => g.id === groupId);
  const plan = plans.find((p) => p.id === group?.plan_id);

  const groupsForCountry = groups.filter((g) => {
    const p = plans.find((pl) => pl.id === g.plan_id);
    return ((p?.currency || "INR") === "CAD" ? "Canada" : "India") === countryFilter;
  });

  useEffect(() => {
    if (!groupId) {
      setMemberships([]);
      setProfiles([]);
      setPayments([]);
      return;
    }
    setLoading(true);
    Promise.all([
      base44.entities.GroupMembership.filter({ group_id: groupId, status: "active" }),
      base44.entities.Payment.filter({ group_id: groupId }),
    ]).then(async ([ms, pays]) => {
      const profs = await Promise.all(
        ms.map((m) => base44.entities.MemberProfile.get(m.member_profile_id).catch(() => null))
      );
      setMemberships(ms);
      setProfiles(profs);
      setPayments(pays);
      setLoading(false);
    });
  }, [groupId]);

  const profileOf = (id) => profiles.find((p) => p?.id === id);

  // "Not paid" here means behind on the group's current month specifically
  // (paid_installments < current_month) — same convention as
  // paymentPreview.js/sendReminders.js use elsewhere in the app. A pending
  // (submitted, not yet admin-approved) payment for that next installment
  // shows as its own "Pending review" state rather than lumping it in with
  // members who haven't submitted anything at all.
  const rows = memberships
    .map((m) => {
      const paid = m.paid_installments || 0;
      const currentMonth = group?.current_month || 1;
      const unpaidCount = Math.max(0, currentMonth - paid);
      const pendingForNext = payments.find(
        (p) => p.membership_id === m.id && p.status === "pending" && p.installment_number === paid + 1
      );
      let status;
      if (unpaidCount === 0) status = "paid";
      else if (pendingForNext) status = "pending_review";
      else status = "not_paid";
      return { membership: m, profile: profileOf(m.member_profile_id), paid, unpaidCount, status };
    })
    .sort((a, b) => {
      const order = { not_paid: 0, pending_review: 1, paid: 2 };
      return order[a.status] - order[b.status];
    });

  const notPaidCount = rows.filter((r) => r.status === "not_paid").length;
  const pendingCount = rows.filter((r) => r.status === "pending_review").length;
  const paidCount = rows.length - notPaidCount - pendingCount;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-primary">Admin</p>
        <h1 className="text-3xl font-semibold text-foreground mt-1">Payment Status</h1>
        <p className="text-sm text-muted-foreground mt-1">
          See exactly who's paid this month and who's still pending, per group.
        </p>
      </div>

      <div className="bg-card rounded-2xl border border-border p-4">
        <Select value={groupId} onValueChange={setGroupId}>
          <SelectTrigger className="w-full sm:w-96"><SelectValue placeholder="Select a group" /></SelectTrigger>
          <SelectContent>
            {groupsForCountry.map((g) => (
              <SelectItem key={g.id} value={g.id}>{g.group_name || g.group_code}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {groupId && !loading && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <StatCard label="Not Paid" value={notPaidCount} tone="destructive" icon={AlertCircle} />
            <StatCard label="Pending Review" value={pendingCount} tone="amber" icon={Clock} />
            <StatCard label="Paid Up" value={paidCount} tone="emerald" icon={CheckCircle2} />
          </div>

          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/70 text-muted-foreground text-xs uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-5 py-3">Member</th>
                    <th className="text-left px-5 py-3">Chit #</th>
                    <th className="text-right px-5 py-3">Installments Paid</th>
                    <th className="text-right px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.length === 0 ? (
                    <tr><td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">No active members in this group.</td></tr>
                  ) : (
                    rows.map((r) => (
                      <tr key={r.membership.id}>
                        <td className="px-5 py-3 text-foreground">{r.profile?.full_name || "—"}</td>
                        <td className="px-5 py-3 text-muted-foreground">{r.membership.chit_number || r.membership.ticket_number || "—"}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-foreground">
                          {r.paid}/{plan?.duration_months || "—"}
                        </td>
                        <td className="px-5 py-3 text-right">
                          {r.status === "paid" && (
                            <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400">Paid up</span>
                          )}
                          {r.status === "pending_review" && (
                            <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400">Pending review</span>
                          )}
                          {r.status === "not_paid" && (
                            <span className="text-xs px-2.5 py-1 rounded-full bg-destructive/15 text-destructive">
                              {r.unpaidCount} month{r.unpaidCount > 1 ? "s" : ""} behind
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {groupId && loading && (
        <div className="h-32 grid place-items-center text-muted-foreground text-sm">Loading…</div>
      )}
    </div>
  );
}

function StatCard({ label, value, tone, icon: Icon }) {
  const toneClasses = {
    destructive: "bg-destructive/10 text-destructive",
    amber: "bg-amber-500/10 text-amber-400",
    emerald: "bg-emerald-500/10 text-emerald-400",
  };
  return (
    <div className="bg-card rounded-2xl border border-border p-5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground mb-2">
        <span className={`p-1.5 rounded-lg ${toneClasses[tone]}`}><Icon className="w-3.5 h-3.5" /></span>
        {label}
      </div>
      <p className="text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}
