import React, { useEffect, useState, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Check, X, Inbox, Users, Link2, Loader2 } from "lucide-react";
import { formatMoney } from "@/lib/currency";
import { Link } from "react-router-dom";
import { logAudit } from "@/lib/audit";
import { addMonthsUTC } from "@/lib/dates";
import { useAdminCountry } from "@/lib/AdminCountryContext";
import { generateChitNumbers } from "@/lib/codeGenerator";

export default function PlanRequests() {
  const { country: countryFilter } = useAdminCountry();
  const [requests, setRequests] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [plans, setPlans] = useState([]);
  const [groups, setGroups] = useState([]);
  const [approveTarget, setApproveTarget] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // Belt-and-suspenders against a fast double-click: `submitting` state
  // guards the button, but its re-render isn't synchronous, so a second
  // click can slip through before the first paints as disabled.
  const submittingRef = useRef(false);

  const load = useCallback(async () => {
    const [reqs, profs, pls, grps] = await Promise.all([
      base44.entities.PlanRequest.list("-created_date", 200),
      base44.entities.MemberProfile.list("-created_date", 500),
      base44.entities.ChitPlan.list("-created_date", 200),
      base44.entities.ChitGroup.list("-created_date", 200),
    ]);
    setRequests(reqs);
    setProfiles(profs);
    setPlans(pls);
    setGroups(grps);
  }, []);

  useEffect(() => { load(); }, [load]);

  const profileOf = (id) => profiles.find((p) => p.id === id);
  const planOf = (id) => plans.find((p) => p.id === id);
  const requestCountry = (r) => ((r.currency || planOf(r.plan_id)?.currency || "INR") === "CAD" ? "Canada" : "India");

  const pending = (requests || []).filter((r) => r.status === "pending" && requestCountry(r) === countryFilter);
  const processed = (requests || []).filter((r) => r.status !== "pending" && requestCountry(r) === countryFilter);

  const groupsForPlan = (planId) =>
    groups.filter((g) => g.plan_id === planId && g.status === "active");

  // needed defaults to 1 for the general group-select filter; the
  // approval dialog passes the actual request's ticket_count so a group
  // that only has, say, 1 seat left isn't offered for a 3-ticket request.
  const seatsAvailable = (g, needed = 1) => {
    const plan = planOf(g.plan_id);
    const cap = plan?.member_count || 0;
    return cap === 0 || (g.filled_seats || 0) + needed <= cap;
  };

  const openApprove = async (req) => {
    setApproveTarget(req);
    setSelectedGroup("");
    setError("");
    const freshGroups = await base44.entities.ChitGroup.list("-created_date", 200);
    setGroups(freshGroups);
  };

  const confirmApprove = async () => {
    if (!approveTarget || !selectedGroup || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    try {
      const group = groups.find((g) => g.id === selectedGroup);
      const plan = planOf(approveTarget.plan_id);
      if (!group || !plan) throw new Error("Group or plan not found");

      const groupMemberships = await base44.entities.GroupMembership.filter({ group_id: group.id });
      const alreadyAssigned = groupMemberships.some((m) => m.member_profile_id === approveTarget.member_profile_id);
      const ticketCount = approveTarget.ticket_count || 1;
      let firstDue = "";

      // A member can also be assigned directly from their profile (Members
      // -> Groups & Chit Plans), bypassing this request. If that already
      // happened, don't dead-end with an error — the admin's intent here is
      // clearly "yes, approve" — just clear the now-redundant request. This
      // stays a simple all-or-nothing skip even for multi-ticket requests:
      // reconciling "they already have 1, but asked for 3" is a rare-enough
      // race that it's safer to leave for the admin to sort out manually
      // than to guess how many more to add.
      if (alreadyAssigned) {
        await base44.entities.PlanRequest.update(approveTarget.id, { status: "approved" });
        logAudit({ module: "Plan Requests", action: "approve", record_id: approveTarget.id, details: `Marked request approved — "${profileOf(approveTarget.member_profile_id)?.full_name || "member"}" was already assigned to group "${group.group_code}"` });
      } else {
        const startTicket = Math.max(0, ...groupMemberships.map((m) => m.ticket_number || 0)) + 1;
        firstDue = addMonthsUTC(group.start_date, 1) || "";

        // One person, ticketCount separate tickets — each is its own
        // group_memberships row (its own ticket_number, its own
        // installment/payment/win tracking), all pointing at the same
        // member_profile_id. See codeGenerator.js / the 2026-08-28 schema
        // change for why membership identity is per-ticket, not per-person.
        const chitNumbers = await generateChitNumbers(ticketCount);
        await base44.entities.GroupMembership.bulkCreate(
          Array.from({ length: ticketCount }, (_, i) => ({
            group_id: group.id,
            member_profile_id: approveTarget.member_profile_id,
            user_id: approveTarget.user_id || "",
            ticket_number: startTicket + i,
            chit_number: chitNumbers[i],
            paid_installments: 0,
            total_paid: 0,
            next_due_date: firstDue,
            has_won: false,
            status: "active",
          }))
        );

        await base44.entities.ChitGroup.update(group.id, { filled_seats: groupMemberships.length + ticketCount });
        await base44.entities.PlanRequest.update(approveTarget.id, { status: "approved" });
        logAudit({ module: "Plan Requests", action: "approve", record_id: approveTarget.id, details: `Approved request, assigned to group "${group.group_code}" (ticket${ticketCount > 1 ? "s" : ""} #${startTicket}${ticketCount > 1 ? `–${startTicket + ticketCount - 1}` : ""})` });
      }

      const approvedProfile = profileOf(approveTarget.member_profile_id);
      const memberMobile = approvedProfile?.mobile;
      if (memberMobile) {
        const startDate = group.start_date ? new Date(group.start_date).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" }) : "TBD";
        const collectionDate = group.monthly_collection_date ? `${group.monthly_collection_date}th of every month` : "TBD";
        const firstDueDate = firstDue ? new Date(firstDue).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" }) : "TBD";
        // Not every group has a WhatsApp chat set up — that must not silently
        // cancel the whole "you've been approved" message (it used to gate
        // the entire send on this link existing). Point to the member's own
        // in-app group view instead so the message still has somewhere
        // useful to send them.
        const groupLink = group.whatsapp_group_link || `${window.location.origin}/my-chits`;

        console.log("📱 Sending group_approved to:", memberMobile, { group_code: group.group_code, startDate, collectionDate, firstDueDate });
        import("@/lib/sendWhatsAppMessage").then(({ sendWhatsAppMessage }) => {
          sendWhatsAppMessage({
            phone: memberMobile,
            templateName: "group_approved_v4",
            parameters: [
              approvedProfile?.full_name || "Member",
              group.group_name || group.group_code,
              plan.plan_name,
              startDate,
              collectionDate,
              firstDueDate,
              groupLink,
            ],
          }).then((res) => {
            console.log("✅ Group approved message sent:", res);
          }).catch((err) => {
            console.error("❌ Approval WhatsApp notification failed:", err);
            logAudit({ module: "Plan Requests", action: "whatsapp-notify-failed", record_id: approveTarget.id, details: `Failed to WhatsApp-notify member of approval for group "${group.group_code}": ${err?.message || err}` });
          });
        });
      } else {
        console.warn("⚠️ Skipped group_approved: missing link or mobile", { link: group.whatsapp_group_link, mobile: memberMobile });
      }

      setApproveTarget(null);
      setSelectedGroup("");
      await load();
    } catch (e) {
      setError(e.message || "Could not complete assignment. Please try again.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const reject = async (req) => {
    await base44.entities.PlanRequest.update(req.id, { status: "rejected" });
    logAudit({ module: "Plan Requests", action: "reject", record_id: req.id, details: `Rejected plan request` });
    await load();
  };

  const requestedTicketCount = approveTarget?.ticket_count || 1;
  const availableGroups = approveTarget
    ? groupsForPlan(approveTarget.plan_id).filter((g) => seatsAvailable(g, requestedTicketCount))
    : [];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-primary">Admin</p>
        <h1 className="text-3xl font-semibold text-foreground mt-1">Plan Requests</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review member enrollment requests, approve and assign to a savings group.
        </p>
      </div>

      {requests === null ? (
        <div className="h-48 grid place-items-center text-muted-foreground text-sm">Loading requests…</div>
      ) : (
        <>
          {/* Pending requests */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Inbox className="w-4 h-4 text-primary" />
              <p className="text-sm font-medium text-foreground">
                Pending {pending.length > 0 && <span className="text-muted-foreground">({pending.length})</span>}
              </p>
            </div>

            {pending.length === 0 ? (
              <div className="bg-card rounded-2xl border border-border p-8 text-center text-sm text-muted-foreground">
                No pending requests. New member plan requests will appear here.
              </div>
            ) : (
              pending.map((req) => {
                const prof = profileOf(req.member_profile_id);
                const plan = planOf(req.plan_id);
                const cur = req.currency || plan?.currency || "INR";
                return (
                  <div key={req.id} className="bg-card rounded-2xl border border-border p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <span className="w-10 h-10 rounded-full bg-primary/10 grid place-items-center text-sm font-semibold text-primary shrink-0">
                        {(prof?.full_name || "?").charAt(0)}
                      </span>
                      <div>
                        <p className="font-medium text-foreground">{prof?.full_name || "Unknown member"}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {prof?.member_code || prof?.mobile || "—"} · {prof?.branch || "—"}
                        </p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                            {req.plan_name}
                          </span>
                          {(req.ticket_count || 1) > 1 && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-medium">
                              {req.ticket_count} tickets
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {formatMoney(plan?.monthly_contribution, cur)}/mo · {plan?.duration_months} months
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        onClick={() => openApprove(req)}
                        className="bg-primary hover:bg-primary/90 rounded-full"
                        size="sm"
                      >
                        <Check className="w-4 h-4 mr-1" /> Approve & Assign
                      </Button>
                      <Button
                        onClick={() => reject(req)}
                        variant="outline"
                        className="rounded-full text-destructive border-destructive/30 hover:bg-destructive/10"
                        size="sm"
                      >
                        <X className="w-4 h-4 mr-1" /> Reject
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Processed requests */}
          {processed.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground pt-4">Recently processed</p>
              <div className="bg-card rounded-2xl border border-border overflow-hidden">
                <div className="divide-y divide-border">
                  {processed.slice(0, 10).map((req) => {
                    const prof = profileOf(req.member_profile_id);
                    return (
                      <div key={req.id} className="px-5 py-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm text-foreground">{prof?.full_name || "Unknown member"}</p>
                          <p className="text-xs text-muted-foreground">{req.plan_name}</p>
                        </div>
                        <span className={`text-xs px-2.5 py-1 rounded-full ${
                          req.status === "approved" ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"
                        }`}>
                          {req.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Approve & Assign dialog */}
      <Dialog open={!!approveTarget} onOpenChange={(o) => !o && setApproveTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-primary" /> Assign to Group
            </DialogTitle>
          </DialogHeader>

          {approveTarget && (
            <div className="space-y-4 py-2">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-sm text-foreground font-medium">
                  {profileOf(approveTarget.member_profile_id)?.full_name || "Member"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {approveTarget.plan_name} · {approveTarget.currency}
                  {requestedTicketCount > 1 && <span className="text-amber-400"> · {requestedTicketCount} tickets requested</span>}
                </p>
              </div>

              {availableGroups.length === 0 ? (
                <div className="text-center py-4">
                  <Users className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground mb-3">
                    {requestedTicketCount > 1
                      ? `No active group has ${requestedTicketCount} seats available for this plan.`
                      : "No active groups with available seats for this plan."}
                  </p>
                  <Link
                    to="/admin/groups"
                    className="text-sm text-primary hover:underline"
                  >
                    Create a new group →
                  </Link>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-medium text-foreground mb-2">Select a savings group</p>
                  <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                    <SelectTrigger><SelectValue placeholder="Choose a group with available seats" /></SelectTrigger>
                    <SelectContent>
                      {availableGroups.map((g) => {
                        const plan = planOf(g.plan_id);
                        const cap = plan?.member_count || 0;
                        return (
                          <SelectItem key={g.id} value={g.id}>
                            {g.group_code} · {g.filled_seats || 0}{cap ? `/${cap}` : ""} seats
                            {g.branch ? ` · ${g.branch}` : ""}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {error && <p className="text-xs text-destructive text-center">{error}</p>}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)} className="rounded-full">Cancel</Button>
            <Button
              onClick={confirmApprove}
              disabled={submitting || !selectedGroup || availableGroups.length === 0}
              className="bg-primary hover:bg-primary/90 rounded-full"
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Assigning…</>
              ) : (
                <><Check className="w-4 h-4 mr-1" /> Confirm Assignment</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}