import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { UserPlus, Trash2 } from "lucide-react";
import { logAudit } from "@/lib/audit";
import { addMonthsUTC } from "@/lib/dates";
import { generateChitNumber } from "@/lib/codeGenerator";
import { sendWhatsAppMessage } from "@/lib/sendWhatsAppMessage";
import { MAX_TICKETS_PER_REQUEST } from "@/components/members/PlanRequestCard";

export default function GroupMembersDialog({ group, plan, onClose }) {
  const [memberships, setMemberships] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [allProfiles, setAllProfiles] = useState([]);
  const [selectedMember, setSelectedMember] = useState("");
  const [adding, setAdding] = useState(false);

  const load = async () => {
    const ms = await base44.entities.GroupMembership.filter({ group_id: group.id });
    setMemberships(ms);
    const profIds = [...new Set(ms.map((m) => m.member_profile_id))];
    const profs = profIds.length ? await Promise.all(profIds.map((id) => base44.entities.MemberProfile.get(id))) : [];
    setProfiles(profs);
    const all = await base44.entities.MemberProfile.list("-created_date", 500);
    setAllProfiles(all);
  };

  useEffect(() => {
    if (group) load();
  }, [group]);

  if (!group) return null;

  // A member already in this group stays offered (not filtered out) so an
  // admin can deliberately give them a second ticket — same as
  // MemberGroupAssignment.jsx. ticketCountOf() labels how many they
  // already hold so re-selecting them is a visible, deliberate choice.
  const ticketCountOf = (memberProfileId) => (memberships || []).filter((m) => m.member_profile_id === memberProfileId).length;
  // Same guard as MemberGroupAssignment.jsx — never offer a member whose
  // own country doesn't match this group's plan currency.
  const groupCountry = (plan?.currency || "INR") === "CAD" ? "Canada" : "India";
  const available = allProfiles.filter((p) => (p.country || "India") === groupCountry);
  const nextTicket = Math.max(0, ...(memberships || []).map((m) => m.ticket_number || 0)) + 1;
  const capacity = plan?.member_count || 0;
  const isFull = capacity > 0 && (memberships?.length || 0) >= capacity;

  const profileOf = (id) => profiles.find((p) => p.id === id);

  const addMember = async () => {
    if (!selectedMember) return;
    if (isFull) return;
    // Same 5-tickets-per-person business rule PlanRequestCard.jsx enforces
    // on the member-facing request flow — this admin screen bypasses that
    // flow entirely, so it needs its own copy of the same cap, or an admin
    // can click "Add another ticket" indefinitely with nothing to stop them.
    if (ticketCountOf(selectedMember) >= MAX_TICKETS_PER_REQUEST) return;
    setAdding(true);
    const prof = allProfiles.find((p) => p.id === selectedMember);
    const firstDue = addMonthsUTC(group.start_date, 1) || "";
    const chitNumber = await generateChitNumber();
    const created = await base44.entities.GroupMembership.create({
      group_id: group.id,
      member_profile_id: selectedMember,
      user_id: prof.user_id || "",
      ticket_number: nextTicket,
      chit_number: chitNumber,
      paid_installments: 0,
      total_paid: 0,
      next_due_date: firstDue,
      has_won: false,
      status: "active",
    });
    await base44.entities.ChitGroup.update(group.id, { filled_seats: (memberships?.length || 0) + 1 });
    logAudit({ module: "Savings Groups", action: "add-member", record_id: created.id, details: `Added "${prof?.full_name || "member"}" to group "${group.group_code}" (ticket #${nextTicket})` });
    // This screen was the one path to "add a member to a group" with no
    // WhatsApp notification at all — MemberGroupAssignment.jsx (the other
    // path to the same outcome) already sends one, so this needed the same
    // fix, not just the missing-link fallback the other two paths got.
    if (prof?.mobile) {
      const groupLink = group.whatsapp_group_link || `${window.location.origin}/my-chits`;
      sendWhatsAppMessage({
        phone: prof.mobile,
        templateName: "group_assignment_invite_v4",
        parameters: [prof.full_name || "Member", group.group_name || group.group_code, plan?.plan_name || "your plan", groupLink],
      }).catch((err) => {
        console.error("Group-invite WhatsApp notification failed:", err);
        logAudit({ module: "Savings Groups", action: "whatsapp-notify-failed", record_id: created.id, details: `Failed to WhatsApp-notify "${prof?.full_name || "member"}" of group assignment: ${err?.message || err}` });
      });
    }
    setSelectedMember("");
    setAdding(false);
    await load();
  };

  const removeMember = async (m) => {
    const prof = profileOf(m.member_profile_id);
    try {
      await base44.entities.GroupMembership.delete(m.id);
    } catch (e) {
      // membership may already be deleted
    }
    await base44.entities.ChitGroup.update(group.id, { filled_seats: Math.max(0, (memberships?.length || 1) - 1) });
    logAudit({ module: "Savings Groups", action: "remove-member", record_id: m.id, details: `Removed "${prof?.full_name || "member"}" (ticket #${m.ticket_number}) from group "${group.group_code}"` });
    await load();
  };

  return (
    <Dialog open={!!group} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{group.group_code} — Members</span>
            <span className="text-sm font-normal text-muted-foreground">
              {memberships?.length || 0}{capacity ? `/${capacity}` : ""} seats
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="mt-2">
          {memberships === null ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading members…</p>
          ) : memberships.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No members assigned yet.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {memberships.map((m) => {
                const prof = profileOf(m.member_profile_id);
                return (
                  <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl border border-border">
                    <span className="w-7 h-7 rounded-full bg-primary/15 grid place-items-center text-xs font-semibold text-primary">
                      {m.ticket_number || "—"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{prof?.full_name || "Member"}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.chit_number ? `Chit #${m.chit_number}` : ""}{m.chit_number && prof?.mobile ? " · " : ""}{prof?.mobile || ""}
                      </p>
                    </div>
                    <button onClick={() => removeMember(m)} className="text-muted-foreground/60 hover:text-destructive p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {!isFull && available.length > 0 && (
          <div className="border-t border-border pt-4">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1">
              <UserPlus className="w-3 h-3" /> Add member · Ticket #{nextTicket}
            </p>
            <div className="flex gap-2">
              <Select value={selectedMember} onValueChange={setSelectedMember}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Select a member" /></SelectTrigger>
                <SelectContent>
                  {available.map((p) => {
                    const count = ticketCountOf(p.id);
                    return (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name} · {p.member_code || p.mobile}
                        {count >= MAX_TICKETS_PER_REQUEST
                          ? ` (max ${MAX_TICKETS_PER_REQUEST} tickets reached)`
                          : count > 0
                          ? ` (already has ${count} ticket${count > 1 ? "s" : ""})`
                          : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <Button
                onClick={addMember}
                disabled={adding || !selectedMember || ticketCountOf(selectedMember) >= MAX_TICKETS_PER_REQUEST}
                className="bg-primary hover:bg-primary/90 rounded-full"
              >
                {adding
                  ? "Adding…"
                  : selectedMember && ticketCountOf(selectedMember) >= MAX_TICKETS_PER_REQUEST
                  ? `Max ${MAX_TICKETS_PER_REQUEST} reached`
                  : ticketCountOf(selectedMember) > 0
                  ? "Add another ticket"
                  : "Add"}
              </Button>
            </div>
          </div>
        )}

        {isFull && (
          <p className="border-t border-border pt-4 text-sm text-amber-400 text-center">This group is full ({capacity} seats).</p>
        )}
      </DialogContent>
    </Dialog>
  );
}