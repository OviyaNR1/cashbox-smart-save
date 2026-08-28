import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Plus, Check, X, FileText, Search, Image } from "lucide-react";
import { Link } from "react-router-dom";
import { formatMoney } from "@/lib/currency";
import { logAudit } from "@/lib/audit";
import { getSignedUrl } from "@/lib/storage";
import { useToast } from "@/components/ui/use-toast";
import { useAdminCountry } from "@/lib/AdminCountryContext";
import { getNextPaymentPreview } from "@/lib/paymentPreview";

const methods = ["upi", "cash", "bank_transfer"];

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
  // Shared with every other admin page via the header dropdown.
  const { country: countryFilter } = useAdminCountry();
  const [form, setForm] = useState({ membership_id: "", amount: "", installment_number: "", method: "cash", payment_date: new Date().toISOString().slice(0, 10) });
  const [suggested, setSuggested] = useState(null);
  const { toast } = useToast();

  const load = () => base44.entities.Payment.list("-payment_date", 300).then(setPayments);
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
  useEffect(() => {
    const ms = memberships.find((m) => m.id === form.membership_id);
    if (!ms) { setSuggested(null); return; }
    const group = groups.find((g) => g.id === ms.group_id);
    const plan = plans.find((p) => p.id === group?.plan_id);
    if (!group || !plan) { setSuggested(null); return; }
    const preview = getNextPaymentPreview({ membership: ms, plan, group, auctions });
    const oldest = preview.unpaidInstallments?.[0];
    if (!oldest) { setSuggested(null); return; }
    setSuggested({ number: oldest.number, amount: oldest.amount, dividend: oldest.dividend || 0, currency: plan.currency || "INR" });
    setForm((f) => ({ ...f, installment_number: String(oldest.number), amount: String(oldest.amount) }));
  }, [form.membership_id, memberships, groups, plans, auctions]);

  const profileOf = (id) => profiles.find((p) => p.id === id);
  const groupOf = (id) => groups.find((g) => g.id === id);
  const planOf = (groupId) => plans.find((p) => p.id === (groups.find((g) => g.id === groupId)?.plan_id));
  const currencyOf = (p) => p.currency || planOf(p.group_id)?.currency || "INR";

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const record = async () => {
    const ms = memberships.find((m) => m.id === form.membership_id);
    if (!ms) return;
    const installmentNum = +form.installment_number || 1;
    const duplicate = (payments || []).find(
      (p) => p.membership_id === ms.id && p.installment_number === installmentNum && p.status !== "failed"
    );
    if (duplicate) {
      toast({
        title: "Already recorded",
        description: `Installment #${installmentNum} for this member is already ${duplicate.status} (txn ${duplicate.transaction_id || duplicate.id.slice(0, 8)}).`,
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    const prof = profileOf(ms.member_profile_id);
    const txn = "TXN" + Date.now().toString().slice(-8);
    const created = await base44.entities.Payment.create({
      transaction_id: txn,
      membership_id: ms.id,
      member_profile_id: ms.member_profile_id,
      group_id: ms.group_id,
      user_id: ms.user_id,
      installment_number: installmentNum,
      amount: +form.amount,
      payment_date: form.payment_date,
      method: form.method,
      currency: planOf(ms.group_id)?.currency || "INR",
      status: "success",
      collected_by: (await base44.auth.me().catch(() => ({}))).email || "admin",
    });
    // Read the membership fresh right before incrementing — `memberships`
    // in component state is only fetched once on mount, so basing the
    // increment on it silently under-counts when recording more than one
    // payment for the same member in a single page session (each call
    // would add 1 to the same stale starting value instead of stacking).
    const freshMs = await base44.entities.GroupMembership.get(ms.id);
    await base44.entities.GroupMembership.update(ms.id, {
      paid_installments: (freshMs?.paid_installments || 0) + 1,
      total_paid: (freshMs?.total_paid || 0) + +form.amount,
    });
    logAudit({ module: "Payments", action: "create", record_id: created.id, details: `Recorded ${form.method} payment of ${form.amount} (txn ${txn}) for ${profileOf(ms.member_profile_id)?.full_name || "member"}` });
    setSaving(false);
    setOpen(false);
    setForm({ membership_id: "", amount: "", installment_number: "", method: "cash", payment_date: new Date().toISOString().slice(0, 10) });
    load();
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
    load();
  };

  const reject = async (p) => {
    await base44.entities.Payment.update(p.id, { status: "failed" });
    logAudit({ module: "Payments", action: "reject", record_id: p.id, details: `Rejected payment ${p.transaction_id || p.id.slice(0, 8)}` });
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
  const filteredPayments = (payments || []).filter((p) => {
    if (paymentCountry(p) !== countryFilter) return false;
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

      <div className="bg-card rounded-2xl border border-border p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search member, transaction ID, method…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/70 text-muted-foreground text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-5 py-3">Transaction</th>
                <th className="text-left px-5 py-3">Member</th>
                <th className="text-left px-5 py-3">Date</th>
                <th className="text-left px-5 py-3">Method</th>
                <th className="text-right px-5 py-3">Amount</th>
                <th className="text-right px-5 py-3">Status</th>
                <th className="text-right px-5 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payments === null ? (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-muted-foreground">Loading…</td></tr>
              ) : filteredPayments.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-muted-foreground">{payments.length === 0 ? "No payments recorded." : "No payments match your search."}</td></tr>
              ) : filteredPayments.map((p) => {
                const prof = profileOf(p.member_profile_id);
                return (
                  <tr key={p.id}>
                    <td className="px-5 py-3 text-foreground">{p.transaction_id || p.id.slice(0, 8)}</td>
                    <td className="px-5 py-3 text-muted-foreground">{prof?.full_name || "—"}</td>
                    <td className="px-5 py-3 text-muted-foreground">{p.payment_date || "—"}</td>
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
                        {prof?.full_name || "Member"} · {grp?.group_code || "Group"} · Ticket #{m.ticket_number}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
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
            <div>
              <Label>Method</Label>
              <Select value={form.method} onValueChange={(v) => set("method", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{methods.map((m) => <SelectItem key={m} value={m} className="capitalize">{m.replace("_", " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Payment date</Label><Input type="date" value={form.payment_date} onChange={(e) => set("payment_date", e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-full">Cancel</Button>
            <Button onClick={record} disabled={saving || !form.membership_id || !form.amount} className="bg-primary hover:bg-primary/90 rounded-full">{saving ? "Saving…" : "Record"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}