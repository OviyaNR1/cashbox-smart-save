import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Plus, Check, X, FileText, Search, Image, MessageCircle, MessageCircleOff } from "lucide-react";
import { Link } from "react-router-dom";
import { formatMoney } from "@/lib/currency";
import { logAudit } from "@/lib/audit";
import { getSignedUrl } from "@/lib/storage";
import FileUpload from "@/components/members/FileUpload";
import { sendWhatsAppMessage } from "@/lib/sendWhatsAppMessage";
import { useToast } from "@/components/ui/use-toast";
import { useAdminCountry } from "@/lib/AdminCountryContext";
import { getNextPaymentPreview } from "@/lib/paymentPreview";

const methods = ["upi", "cash"];

const statusTone = (s) => s === "success" ? "bg-emerald-500/15 text-emerald-400" : s === "pending" ? "bg-amber-500/15 text-amber-400" : s === "failed" ? "bg-rose-500/15 text-rose-400" : "bg-muted text-muted-foreground";

export default function Payments() {
  const [payments, setPayments] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [groups, setGroups] = useState([]);
  const [plans, setPlans] = useState([]);
  const [auctions, setAuctions] = useState([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  // "all" (no filter) or a specific installment number as a string, since
  // Select values are always strings.
  const [installmentFilter, setInstallmentFilter] = useState("all");
  // Shared with every other admin page via the header dropdown.
  const { country: countryFilter } = useAdminCountry();
  const [form, setForm] = useState({ membership_id: "", amount: "", installment_number: "", method: "cash", payment_date: new Date().toISOString().slice(0, 10), screenshotPath: "" });
  const [suggested, setSuggested] = useState(null);
  // A member holding more than one ticket can pay both together with one
  // screenshot (the member-facing PayAllDialog already supports this) —
  // this lets the admin record that as one combined action too instead of
  // being limited to exactly one membership per "Record payment" click.
  // Keyed by membership_id; the primary selection above is always treated
  // as included.
  const [includedSiblingIds, setIncludedSiblingIds] = useState(new Set());
  const [ticketOverrides, setTicketOverrides] = useState({});
  const { toast } = useToast();

  // Sorted by created_at, not payment_date — payment_date is just a
  // calendar day (shared by every payment recorded that day, as the Date
  // column above now makes obvious), so sorting by it left same-day rows
  // in an arbitrary order with no real "most recent first" meaning.
  const load = () => base44.entities.Payment.list("-created_at", 300).then(setPayments);
  useEffect(() => {
    load();
    base44.entities.GroupMembership.list("-created_date", 200).then(setMemberships);
    base44.entities.MemberProfile.list("-created_date", 200).then(setProfiles);
    base44.entities.ChitGroup.list("-created_date", 200).then(setGroups);
    base44.entities.ChitPlan.list("-created_date", 200).then(setPlans);
    base44.entities.Auction.list("-created_date", 500).then(setAuctions);
  }, []);

  // Pre-fill the installment number and the dividend-adjusted amount the
  // member actually owes right now, so the admin isn't expected to compute
  // it by hand — same source of truth MyChits.jsx shows the member.
  //
  // getNextPaymentPreview's `nextInstallment` is the CURRENT month's rate
  // (collapsed for the member-facing summary) — it does not line up with
  // `paid_installments + 1` when a member is behind by more than one
  // installment, since each overdue month keeps its own historical rate.
  // Recording payment here is for a specific installment number, so pull
  // that installment's own amount out of unpaidInstallments (oldest-first)
  // instead of pairing the collapsed "next" figure with the oldest number.
  const profileOf = (id) => profiles.find((p) => p.id === id);
  const groupOf = (id) => groups.find((g) => g.id === id);
  const planOf = (groupId) => plans.find((p) => p.id === (groups.find((g) => g.id === groupId)?.plan_id));
  const currencyOf = (p) => p.currency || planOf(p.group_id)?.currency || "INR";

  // Same source of truth MyChits.jsx shows the member — the oldest unpaid
  // installment's own amount, not the collapsed "next" figure (see below).
  const previewFor = (ms) => {
    const group = groups.find((g) => g.id === ms.group_id);
    const plan = plans.find((p) => p.id === group?.plan_id);
    if (!group || !plan) return null;
    const preview = getNextPaymentPreview({ membership: ms, plan, group, auctions });
    const oldest = preview.unpaidInstallments?.[0];
    if (!oldest) return null;
    return { number: oldest.number, amount: oldest.amount, dividend: oldest.dividend || 0, currency: plan.currency || "INR" };
  };

  // Pre-fill the installment number and the dividend-adjusted amount the
  // member actually owes right now, so the admin isn't expected to compute
  // it by hand.
  //
  // getNextPaymentPreview's `nextInstallment` is the CURRENT month's rate
  // (collapsed for the member-facing summary) — it does not line up with
  // `paid_installments + 1` when a member is behind by more than one
  // installment, since each overdue month keeps its own historical rate.
  // Recording payment here is for a specific installment number, so pull
  // that installment's own amount out of unpaidInstallments (oldest-first)
  // instead of pairing the collapsed "next" figure with the oldest number.
  useEffect(() => {
    const ms = memberships.find((m) => m.id === form.membership_id);
    setIncludedSiblingIds(new Set());
    setTicketOverrides({});
    if (!ms) { setSuggested(null); return; }
    const p = previewFor(ms);
    if (!p) { setSuggested(null); return; }
    setSuggested(p);
    setForm((f) => ({ ...f, installment_number: String(p.number), amount: String(p.amount) }));
  }, [form.membership_id, memberships, groups, plans, auctions]);

  // Other active tickets held by the same member as the primary selection
  // above — shown as addable checkboxes so a member who paid several
  // tickets together with one screenshot can be recorded that way too,
  // instead of forcing one "Record payment" click per ticket.
  const primaryMembership = memberships.find((m) => m.id === form.membership_id);
  const siblingMemberships = primaryMembership
    ? memberships.filter((m) => m.id !== primaryMembership.id && m.member_profile_id === primaryMembership.member_profile_id && m.status === "active")
    : [];
  const includedTickets = primaryMembership
    ? [primaryMembership, ...siblingMemberships.filter((m) => includedSiblingIds.has(m.id))].map((ms) => {
        const p = previewFor(ms);
        const override = ticketOverrides[ms.id];
        const isPrimary = ms.id === primaryMembership.id;
        return {
          membership: ms,
          number: isPrimary ? +form.installment_number || p?.number : override?.number ?? p?.number,
          amount: isPrimary ? +form.amount || 0 : override?.amount ?? p?.amount ?? 0,
          preview: p,
        };
      })
    : [];
  const combinedTotal = includedTickets.reduce((s, t) => s + (t.amount || 0), 0);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const record = async () => {
    if (!includedTickets.length) return;

    // Checked up front, across every included ticket — recording 1 of 2
    // tickets cleanly must not silently also skip or double the other.
    for (const t of includedTickets) {
      const duplicate = (payments || []).find(
        (p) => p.membership_id === t.membership.id && p.installment_number === t.number && p.status !== "failed"
      );
      if (duplicate) {
        toast({
          title: "Already recorded",
          description: `Installment #${t.number} for ${profileOf(t.membership.member_profile_id)?.full_name || "this member"} (chit #${t.membership.chit_number || t.membership.ticket_number}) is already ${duplicate.status} (txn ${duplicate.transaction_id || duplicate.id.slice(0, 8)}).`,
          variant: "destructive",
        });
        return;
      }
    }

    setSaving(true);
    const me = await base44.auth.me().catch(() => ({}));
    // Only stamped as a shared batch id when there's actually more than one
    // ticket — a single-ticket recording keeps today's plain "TXN..." id.
    // Same reasoning as PayAllDialog's batchId: this is what lets
    // maybeSendBatchReceipt (and the "N tickets" badge in the table below)
    // recognize these rows as one combined payment instead of two
    // unrelated ones.
    const batchId = includedTickets.length > 1
      ? `TXN${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase()
      : "TXN" + Date.now().toString().slice(-8);

    let firstCreated = null;
    for (const t of includedTickets) {
      const ms = t.membership;
      const created = await base44.entities.Payment.create({
        transaction_id: batchId,
        membership_id: ms.id,
        member_profile_id: ms.member_profile_id,
        group_id: ms.group_id,
        user_id: ms.user_id,
        installment_number: t.number,
        amount: t.amount,
        payment_date: form.payment_date,
        method: form.method,
        currency: planOf(ms.group_id)?.currency || "INR",
        status: "success",
        collected_by: me.email || "admin",
        etransfer_screenshot_url: form.screenshotPath || undefined,
      });
      // Read the membership fresh right before incrementing — `memberships`
      // in component state is only fetched once on mount, so basing the
      // increment on it silently under-counts when recording more than one
      // payment for the same member in a single page session (each call
      // would add 1 to the same stale starting value instead of stacking).
      const freshMs = await base44.entities.GroupMembership.get(ms.id);
      await base44.entities.GroupMembership.update(ms.id, {
        paid_installments: (freshMs?.paid_installments || 0) + 1,
        total_paid: (freshMs?.total_paid || 0) + t.amount,
      });
      logAudit({ module: "Payments", action: "create", record_id: created.id, details: `Recorded ${form.method} payment of ${t.amount} (txn ${batchId}) for ${profileOf(ms.member_profile_id)?.full_name || "member"} (chit #${ms.chit_number || ms.ticket_number})` });
      if (!firstCreated) firstCreated = created;
    }
    // Every row created above is already "success" (an admin recording a
    // payment is itself the confirmation, unlike a member's submission
    // which starts "pending") — maybeSendBatchReceipt sees the whole batch
    // already resolved and sends one combined receipt immediately, same as
    // it does once an approved batch finishes resolving.
    if (firstCreated) await maybeSendBatchReceipt(firstCreated);
    setSaving(false);
    setOpen(false);
    setForm({ membership_id: "", amount: "", installment_number: "", method: "cash", payment_date: new Date().toISOString().slice(0, 10), screenshotPath: "" });
    setIncludedSiblingIds(new Set());
    setTicketOverrides({});
    load();
  };

  // A multi-ticket member's combined PayAllDialog submission creates one
  // Payment row per ticket, all sharing one transaction_id stamped by that
  // dialog — but there's no bulk-approve action here, so the admin still
  // approves/rejects each row with its own separate click. Firing a
  // receipt on every individual approve() would send one WhatsApp message
  // per ticket for what the member experienced as one combined payment
  // with one screenshot. This only sends once every row sharing that same
  // transaction_id has reached a final state (approved or rejected), and
  // combines whichever ones succeeded into a single message. A payment
  // with no transaction_id (every admin-recorded one, and any legacy row
  // from before this existed) has no batch to wait on and sends right away.
  const maybeSendBatchReceipt = async (resolvedPayment) => {
    const batchId = resolvedPayment.transaction_id;
    // Queried fresh from the database, not read from `payments` component
    // state — that state only refreshes via load() at the end of each
    // approve()/reject() call, so approving two rows of the same batch in
    // quick succession could have each one see the OTHER as still
    // "pending" from a stale snapshot taken before either write landed.
    // That's not just a wrong read: with no retry, neither call would ever
    // see the batch as resolved, and the receipt would silently never send
    // for a batch that in reality finished resolving. A fresh query is
    // immune to that regardless of how close together the clicks land.
    const siblings = batchId
      ? (await base44.entities.Payment.filter({ transaction_id: batchId })).filter((x) => x.id !== resolvedPayment.id)
      : [];
    if (siblings.some((s) => s.status === "pending")) return;

    const batchRows = [resolvedPayment, ...siblings].filter((x) => x.status === "success");
    if (batchRows.length === 0) return;
    // Belt-and-suspenders against two approve() calls resolving the same
    // batch's last two rows close enough together that both queries land
    // after both writes commit — vanishingly unlikely for two separate
    // human clicks, but cheap to guard: if any row in the batch already
    // shows a receipt went out, this isn't the call that gets to send it.
    if (batchRows.some((r) => r.receipt_sent_at)) return;

    const prof = profileOf(resolvedPayment.member_profile_id);
    if (!prof?.mobile) return;

    const totalAmount = batchRows.reduce((s, r) => s + (r.amount || 0), 0);
    const installmentsLabel = batchRows.map((r) => `#${r.installment_number}`).join(" & ");
    // Several tickets' worth of payments don't have one single receipt
    // page to link to — /payments shows the member everything at once
    // instead of picking one row's page arbitrarily.
    const receiptUrl = batchRows.length > 1
      ? `${window.location.origin}/payments`
      : `${window.location.origin}/receipt/${batchRows[0].id}`;

    try {
      await sendWhatsAppMessage({
        phone: prof.mobile,
        templateName: "receipt_ready_v3",
        parameters: [prof.full_name || "Member", installmentsLabel, formatMoney(totalAmount, currencyOf(resolvedPayment)), receiptUrl],
      });
      await Promise.all(batchRows.map((r) => base44.entities.Payment.update(r.id, { receipt_sent_at: new Date().toISOString() })));
    } catch (err) {
      console.error(`Failed to auto-send receipt for ${resolvedPayment.member_profile_id}:`, err);
      toast({
        title: "Payment approved — receipt failed to send",
        description: `${prof.full_name || "Member"}: you can resend it from the Receipt page.`,
        variant: "destructive",
      });
    }
  };

  const approve = async (p) => {
    const alreadyPaid = (payments || []).find(
      (other) => other.id !== p.id && other.membership_id === p.membership_id
        && other.installment_number === p.installment_number && other.status === "success"
    );
    if (alreadyPaid) {
      toast({
        title: "Already paid",
        description: `Installment #${p.installment_number} for this member was already approved (txn ${alreadyPaid.transaction_id || alreadyPaid.id.slice(0, 8)}). Reject this one instead if it's a duplicate.`,
        variant: "destructive",
      });
      return;
    }
    await base44.entities.Payment.update(p.id, { status: "success" });
    // Same staleness issue as record() above — fetch fresh rather than
    // trusting the once-loaded `memberships` state, so approving several
    // pending payments in a row doesn't lose all but the last increment.
    const freshMs = await base44.entities.GroupMembership.get(p.membership_id);
    if (freshMs) {
      await base44.entities.GroupMembership.update(freshMs.id, {
        paid_installments: (freshMs.paid_installments || 0) + 1,
        total_paid: (freshMs.total_paid || 0) + (p.amount || 0),
      });
    }
    logAudit({ module: "Payments", action: "approve", record_id: p.id, details: `Approved payment ${p.transaction_id || p.id.slice(0, 8)}` });
    await maybeSendBatchReceipt({ ...p, status: "success" });
    load();
  };

  const reject = async (p) => {
    await base44.entities.Payment.update(p.id, { status: "failed" });
    logAudit({ module: "Payments", action: "reject", record_id: p.id, details: `Rejected payment ${p.transaction_id || p.id.slice(0, 8)}` });
    // A rejection can still be the last unresolved row in someone else's
    // batch — e.g. one ticket's screenshot was illegible and got rejected
    // while the other ticket in the same submission was fine — so the
    // batch's receipt (covering just the ones that succeeded) still needs
    // to fire now rather than never.
    await maybeSendBatchReceipt({ ...p, status: "failed" });
    load();
  };

  // A multi-seat member paying several tickets in one PayAllDialog batch
  // gets one `payments` row per ticket, each needing its own WhatsApp
  // receipt — this sends every one of a member's still-unsent successful
  // payments in one action instead of opening each receipt page in turn.
  const unsentReceiptsFor = (memberProfileId) =>
    (payments || []).filter((p) => p.member_profile_id === memberProfileId && p.status === "success" && !p.receipt_sent_at);

  const sendAllReceipts = async (memberProfileId) => {
    const prof = profileOf(memberProfileId);
    const targets = unsentReceiptsFor(memberProfileId);
    if (!prof?.mobile || !targets.length) return;
    let sent = 0;
    for (const p of targets) {
      try {
        const receiptUrl = `${window.location.origin}/receipt/${p.id}`;
        await sendWhatsAppMessage({
          phone: prof.mobile,
          templateName: "receipt_ready_v3",
          parameters: [prof.full_name || "Member", String(p.installment_number || "—"), formatMoney(p.amount, currencyOf(p)), receiptUrl],
        });
        await base44.entities.Payment.update(p.id, { receipt_sent_at: new Date().toISOString() });
        sent++;
      } catch (err) {
        console.error(`Failed to send receipt for payment ${p.id}:`, err);
      }
    }
    logAudit({ module: "Payments", action: "send-all-receipts", record_id: memberProfileId, details: `Sent ${sent} of ${targets.length} receipts to ${prof.full_name || "member"}` });
    toast({
      title: sent === targets.length ? `Sent ${sent} receipt${sent === 1 ? "" : "s"}` : `Sent ${sent} of ${targets.length} receipts`,
      description: prof.full_name,
      variant: sent === targets.length ? undefined : "destructive",
    });
    load();
  };

  const viewProof = async (p) => {
    try {
      const url = await getSignedUrl("payment-proofs", p.etransfer_screenshot_url);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      /* proof unavailable */
    }
  };

  const paymentCountry = (p) => (currencyOf(p) === "CAD" ? "Canada" : "India");
  // Scoped to the selected country, same reasoning as Members.jsx's stats —
  // this is a summary of the current market, not of the search/filter below.
  const pendingCount = (payments || []).filter((p) => p.status === "pending" && paymentCountry(p) === countryFilter).length;
  // Options for the month filter — only installment numbers that actually
  // appear for this country, not a hardcoded 1..N (plans vary in length).
  const installmentOptions = [...new Set(
    (payments || []).filter((p) => paymentCountry(p) === countryFilter).map((p) => p.installment_number)
  )].sort((a, b) => a - b);
  const filteredPayments = (payments || []).filter((p) => {
    if (paymentCountry(p) !== countryFilter) return false;
    if (installmentFilter !== "all" && p.installment_number !== +installmentFilter) return false;
    if (!query.trim()) return true;
    const prof = profileOf(p.member_profile_id);
    const haystack = `${prof?.full_name || ""} ${p.transaction_id || ""} ${p.method || ""}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-primary">Admin</p>
          <h1 className="text-3xl font-semibold text-foreground mt-1">Payments</h1>
          {pendingCount > 0 && <p className="text-xs text-amber-400 mt-1">{pendingCount} pending approval</p>}
        </div>
        <Button onClick={() => setOpen(true)} className="bg-primary hover:bg-primary/90 rounded-full">
          <Plus className="w-4 h-4 mr-1" /> Record payment
        </Button>
      </div>

      <div className="bg-card rounded-2xl border border-border p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search member, transaction ID, method…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <Select value={installmentFilter} onValueChange={setInstallmentFilter}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Month" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All months</SelectItem>
            {installmentOptions.map((n) => (
              <SelectItem key={n} value={String(n)}>Month {n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/70 text-muted-foreground text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-5 py-3">Transaction</th>
                <th className="text-left px-5 py-3">Member</th>
                <th className="text-left px-5 py-3">Installment</th>
                <th className="text-left px-5 py-3">Date</th>
                <th className="text-left px-5 py-3">Method</th>
                <th className="text-right px-5 py-3">Amount</th>
                <th className="text-right px-5 py-3">Status</th>
                <th className="text-right px-5 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payments === null ? (
                <tr><td colSpan={8} className="px-5 py-8 text-center text-muted-foreground">Loading…</td></tr>
              ) : filteredPayments.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-8 text-center text-muted-foreground">{payments.length === 0 ? "No payments recorded." : "No payments match your search."}</td></tr>
              ) : filteredPayments.map((p) => {
                const prof = profileOf(p.member_profile_id);
                // Same transaction_id as another row = submitted together
                // in one PayAllDialog batch (one screenshot, one member
                // action) — surfaced here so approving them one at a time
                // (there's no bulk-approve button) doesn't read as two
                // unrelated payments that happen to match.
                const batchSize = p.transaction_id
                  ? (payments || []).filter((x) => x.transaction_id === p.transaction_id).length
                  : 1;
                return (
                  <tr key={p.id}>
                    <td className="px-5 py-3 text-foreground">{p.transaction_id || p.id.slice(0, 8)}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {prof?.full_name || "—"}
                      {batchSize > 1 && (
                        <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                          {batchSize} tickets
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">#{p.installment_number || "—"}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {/* payment_date is just the calendar date (which
                          month's installment this is) — created_at is the
                          real timestamp of when the row was actually
                          recorded, with full time precision, and always
                          populated (DB default now()) regardless of what
                          the submitting code set payment_date to. */}
                      {p.created_at ? new Date(p.created_at).toLocaleString() : (p.payment_date || "—")}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground capitalize">{(p.method || "").replace("_", " ")}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-foreground">{formatMoney(p.amount, currencyOf(p))}</td>
                    <td className="px-5 py-3 text-right">
                      <span className={`text-xs px-2.5 py-1 rounded-full ${statusTone(p.status)}`}>{p.status}</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {p.status === "pending" && (
                          <>
                            <button onClick={() => approve(p)} className="p-1.5 rounded-lg hover:bg-emerald-500/10 text-emerald-400" title="Approve">
                              <Check className="w-4 h-4" />
                            </button>
                            <button onClick={() => reject(p)} className="p-1.5 rounded-lg hover:bg-rose-500/10 text-destructive" title="Reject">
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {p.etransfer_screenshot_url && (
                          <button onClick={() => viewProof(p)} className="p-1.5 rounded-lg hover:bg-primary/10 text-primary" title="View payment screenshot">
                            <Image className="w-4 h-4" />
                          </button>
                        )}
                        <Link to={`/receipt/${p.id}`} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground" title="Receipt">
                          <FileText className="w-4 h-4" />
                        </Link>
                        {p.receipt_sent_at ? (
                          <MessageCircle
                            className="w-4 h-4 text-emerald-400"
                            title={`Receipt sent ${new Date(p.receipt_sent_at).toLocaleString()}`}
                          />
                        ) : p.status === "success" && unsentReceiptsFor(p.member_profile_id).length > 1 ? (
                          <button
                            onClick={() => sendAllReceipts(p.member_profile_id)}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg border border-primary/30 text-primary text-xs font-medium hover:bg-primary/10"
                            title="Send WhatsApp receipts for all of this member's unsent payments"
                          >
                            <MessageCircle className="w-3.5 h-3.5" /> Send all ({unsentReceiptsFor(p.member_profile_id).length})
                          </button>
                        ) : (
                          <MessageCircleOff
                            className="w-4 h-4 text-muted-foreground/40"
                            title="Receipt not sent via WhatsApp yet"
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Record payment</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2">
              <Label>Member (membership)</Label>
              <Select value={form.membership_id} onValueChange={(v) => set("membership_id", v)}>
                <SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger>
                <SelectContent>
                  {memberships.map((m) => {
                    const prof = profileOf(m.member_profile_id);
                    const grp = groupOf(m.group_id);
                    return (
                      <SelectItem key={m.id} value={m.id}>
                        {prof?.full_name || "Member"} · {grp?.group_code || "Group"} · Chit #{m.chit_number || m.ticket_number}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {siblingMemberships.length > 0 && (
              <div className="col-span-2 p-3 bg-primary/5 rounded-lg border border-primary/20 space-y-2">
                <p className="text-xs font-semibold text-foreground">
                  This member holds {siblingMemberships.length + 1} tickets — paid together?
                </p>
                {siblingMemberships.map((m) => {
                  const p = previewFor(m);
                  const checked = includedSiblingIds.has(m.id);
                  return (
                    <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setIncludedSiblingIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(m.id); else next.delete(m.id);
                            return next;
                          });
                        }}
                        className="accent-primary"
                      />
                      <span className="text-foreground">Chit #{m.chit_number || m.ticket_number}</span>
                      {p ? (
                        <span className="text-muted-foreground">— Installment #{p.number}, {formatMoney(p.amount, p.currency)}</span>
                      ) : (
                        <span className="text-muted-foreground">— fully paid up</span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}

            <div><Label>Installment #</Label><Input type="number" value={form.installment_number} onChange={(e) => set("installment_number", e.target.value)} /></div>
            <div>
              <Label>Amount</Label>
              <Input type="number" value={form.amount} onChange={(e) => set("amount", e.target.value)} />
              {suggested && (
                <p className="text-xs text-muted-foreground mt-1">
                  Suggested: {formatMoney(suggested.amount, suggested.currency)}
                  {suggested.dividend > 0 && ` (${formatMoney(suggested.dividend, suggested.currency)} dividend already applied)`}
                </p>
              )}
            </div>

            {includedSiblingIds.size > 0 && (
              <div className="col-span-2 flex items-center justify-between px-3 py-2 rounded-lg bg-muted/40 text-sm">
                <span className="text-muted-foreground">Combined total ({includedTickets.length} tickets)</span>
                <span className="font-semibold text-foreground">{formatMoney(combinedTotal, suggested?.currency || "INR")}</span>
              </div>
            )}

            <div>
              <Label>Method</Label>
              <Select value={form.method} onValueChange={(v) => set("method", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{methods.map((m) => <SelectItem key={m} value={m} className="capitalize">{m.replace("_", " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Payment date</Label><Input type="date" value={form.payment_date} onChange={(e) => set("payment_date", e.target.value)} /></div>
            <div className="col-span-2">
              <FileUpload
                label="Payment screenshot (optional)"
                value={form.screenshotPath}
                onChange={(path) => set("screenshotPath", path)}
                bucket="payment-proofs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-full">Cancel</Button>
            <Button onClick={record} disabled={saving || !form.membership_id || !form.amount} className="bg-primary hover:bg-primary/90 rounded-full">
              {saving ? "Saving…" : includedTickets.length > 1 ? `Record ${includedTickets.length} Payments` : "Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}