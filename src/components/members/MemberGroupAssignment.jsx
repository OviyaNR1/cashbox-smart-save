import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { UserPlus, Trash2 } from "lucide-react";
import { logAudit } from "@/lib/audit";
import { addMonthsUTC } from "@/lib/dates";
import { sendWhatsAppMessage } from "@/lib/sendWhatsAppMessage";

export default function MemberGroupAssignment({ member, onUpdated }) {
  const [groups, setGroups] = useState([]);
  const [plans, setPlans] = useState([]);
  const [memberships, setMemberships] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [adding, setAdding] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    if (!member) return;
    const [allGroups, allPlans, ms] = await Promise.all([
      base44.entities.ChitGroup.list("-created_date", 200),
      base44.entities.ChitPlan.list("-created_date", 200),
      base44.entities.GroupMembership.filter({ member_profile_id: member.id }),
    ]);
    setGroups(allGroups);
    setPlans(allPlans);
    setMemberships(ms);
  };

  useEffect(() => {
    setMemberships(null);
    setSelectedGroup("");
    load();
  }, [member?.id]);

  if (!member) return null;

  const planOf = (groupId) => {
    const g = groups.find((g) => g.id === groupId);
    return g ? plans.find((p) => p.id === g.plan_id) : null;
  };
  const groupOf = (groupId) => groups.find((g) => g.id === groupId);

  // Group a member's already in stays offered (not filtered out) so an
  // admin can deliberately give them a second ticket in the same group —
  // e.g. one person holding multiple slots. ticketCountIn() surfaces how
  // many they already hold so re-selecting the same group is a visible,
  // deliberate choice rather than an easy-to-fumble accidental duplicate.
  const ticketCountIn = (groupId) => (memberships || []).filter((m) => m.group_id === groupId).length;
  // Never offer a group whose plan currency doesn't match this member's own
  // country — an India member's payments/KYC assume INR; assigning them
  // into a CAD group would silently corrupt those assumptions.
  const memberCountry = member.country || "India";
  // A group at capacity has no seat left for anyone — a new person or an
  // existing member's extra ticket alike — so it's excluded outright, the
  // same rule GroupMembersDialog.jsx already enforces from the group side.
  const hasCapacity = (g) => {
    const cap = planOf(g.id)?.member_count || 0;
    return cap === 0 || (g.filled_seats || 0) < cap;
  };
  const available = groups.filter((g) => {
    if (g.status !== "active" || !hasCapacity(g)) return false;
    const plan = planOf(g.id);
    const groupCountry = (plan?.currency || "INR") === "CAD" ? "Canada" : "India";
    return groupCountry === memberCountry;
  });

  const assign = async () => {
    if (!selectedGroup) return;
    setAdding(true);
    try {
      const group = groups.find((g) => g.id === selectedGroup);
      const existingMemberships = await base44.entities.GroupMembership.filter({ group_id: selectedGroup });
      const nextTicket = Math.max(0, ...existingMemberships.map((m) => m.ticket_number || 0)) + 1;
      const firstDue = addMonthsUTC(group?.start_date, 1) || "";
      const created = await base44.entities.GroupMembership.create({
        group_id: selectedGroup,
        member_profile_id: member.id,
        user_id: member.user_id || "",
        ticket_number: nextTicket,
        paid_installments: 0,
        total_paid: 0,
        next_due_date: firstDue,
        has_won: false,
        status: "active",
      });
      if (group) {
        await base44.entities.ChitGroup.update(group.id, { filled_seats: existingMemberships.length + 1 });
      }
      // Keep Plan Requests in sync — this screen assigns members directly,
      // bypassing the request/approve flow. Without this, a pending request
      // for this same plan is left orphaned forever, and a later attempt to
      // approve it through Plan Requests dead-ends on "already assigned".
      if (group?.plan_id) {
        const matchingRequests = await base44.entities.PlanRequest.filter({
          member_profile_id: member.id,
          plan_id: group.plan_id,
          status: "pending",
        });
        await Promise.all(
          matchingRequests.map((r) => base44.entities.PlanRequest.update(r.id, { status: "approved" }))
        );
      }
      logAudit({ module: "Savings Groups", action: "add-member", record_id: created.id, details: `Assigned "${member.full_name || "member"}" to group "${group?.group_code || selectedGroup}" (ticket #${nextTicket})` });
      // Same invite-link send PlanRequests.jsx does on approval — this
      // screen is the other path to the same outcome (direct assignment
      // instead of request/approve), so it needs the same notification or
      // members assigned this way never hear about the group chat at all.
      if (group?.whatsapp_group_link && member.mobile) {
        const plan = planOf(group.id);
        // Free-form text only reaches numbers that messaged the business in
        // the last 24 hours — a member assigned this way has no guarantee
        // of that, so this has to be an approved template.
        sendWhatsAppMessage({
          phone: member.mobile,
          templateName: "group_assignment_invite_v3",
          parameters: [member.full_name || "Member", group.group_name || group.group_code, plan?.plan_name || "your plan", group.whatsapp_group_link],
        }).catch((err) => {
          console.error("Group-invite WhatsApp notification failed:", err);
          logAudit({ module: "Savings Groups", action: "whatsapp-notify-failed", record_id: created.id, details: `Failed to WhatsApp-notify "${member.full_name || "member"}" of group assignment: ${err?.message || err}` });
        });
      }
      setSelectedGroup("");
      await load();
      toast({ title: "Assigned to group" });
      // The member profile itself doesn't change here (group membership is
      // a separate table) — pass it back unchanged so the parent's handler,
      // which always expects an updated-member object, doesn't crash on
      // `updated.id` when called with nothing.
      onUpdated?.(member);
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setAdding(false);
  };

  const remove = async (m) => {
    try {
      await base44.entities.GroupMembership.delete(m.id);
      const group = groupOf(m.group_id);
      if (group) {
        await base44.entities.ChitGroup.update(group.id, {
          filled_seats: Math.max(0, (group.filled_seats || 1) - 1),
        });
      }
      logAudit({ module: "Savings Groups", action: "remove-member", record_id: m.id, details: `Removed "${member.full_name || "member"}" (ticket #${m.ticket_number}) from group "${group?.group_code || m.group_id}"` });
      await load();
      toast({ title: "Removed from group" });
      // The member profile itself doesn't change here (group membership is
      // a separate table) — pass it back unchanged so the parent's handler,
      // which always expects an updated-member object, doesn't crash on
      // `updated.id` when called with nothing.
      onUpdated?.(member);
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="rounded-xl border border-border divide-y divide-border/50">
      {memberships === null ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">Loading groups…</p>
      ) : memberships.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">Not assigned to any group yet.</p>
      ) : (
        memberships.map((m) => {
          const g = groupOf(m.group_id);
          const p = planOf(m.group_id);
          return (
            <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-7 h-7 rounded-full bg-primary/15 grid place-items-center text-xs font-semibold text-primary">
                {m.ticket_number || "—"}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">
                  {g?.group_name || g?.group_code || "Group"}
                </p>
                <p className="text-xs text-muted-foreground">{p?.plan_name || "—"}</p>
              </div>
              <button onClick={() => remove(m)} className="text-muted-foreground/60 hover:text-destructive p-1">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          );
        })
      )}

      {available.length > 0 && (
        <div className="px-4 py-3">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1">
            <UserPlus className="w-3 h-3" /> Assign to group
          </p>
          <div className="flex gap-2">
            <Select value={selectedGroup} onValueChange={setSelectedGroup}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select a group" />
              </SelectTrigger>
              <SelectContent>
                {available.map((g) => {
                  const p = plans.find((pl) => pl.id === g.plan_id);
                  const count = ticketCountIn(g.id);
                  return (
                    <SelectItem key={g.id} value={g.id}>
                      {g.group_name || g.group_code}{p ? ` · ${p.plan_name}` : ""}
                      {count > 0 ? ` (already has ${count} ticket${count > 1 ? "s" : ""})` : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <button
              onClick={assign}
              disabled={adding || !selectedGroup}
              className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 whitespace-nowrap"
            >
              {adding ? "Adding…" : ticketCountIn(selectedGroup) > 0 ? "Add another ticket" : "Assign"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}