import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatMoney } from "@/lib/currency";
import { generateAuctionPlan } from "@/lib/auctionEngine";
import { logAudit } from "@/lib/audit";
import { useAdminCountry } from "@/lib/AdminCountryContext";

const empty = { plan_name: "", model: "chit_fund", company_label: "", chit_amount: 100000, member_count: 20, duration_months: 20, monthly_contribution: 5000, fixed_dividend: 0, commission_percent: 5, late_interest_percent: 2, auction_min_decrement: 25, currency: "INR", status: "active" };

function getMaxDividend(plan) {
  const result = generateAuctionPlan(plan, null);
  if (!result || result.monthlySummary.length < 2) return 0;
  return result.monthlySummary[1].dividendPerMember;
}

export default function ChitPlans() {
  const { country: countryFilter } = useAdminCountry();
  const [plans, setPlans] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = () => base44.entities.ChitPlan.list("-created_date", 200).then(setPlans);
  useEffect(() => { load(); }, []);

  const filteredPlans = plans?.filter((p) => ((p.currency || "INR") === "CAD" ? "Canada" : "India") === countryFilter) ?? null;

  // New plans default to whichever market the admin is currently viewing.
  const openNew = () => { setForm({ ...empty, currency: countryFilter === "Canada" ? "CAD" : "INR" }); setEditing("new"); };
  const openEdit = (p) => { setForm({ ...p }); setEditing(p.id); };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await base44.entities.ChitPlan.delete(deleteTarget.id);
    logAudit({ module: "Chit Plans", action: "delete", record_id: deleteTarget.id, details: `Deleted plan "${deleteTarget.plan_name}"` });
    setDeleteTarget(null);
    load();
  };

  const toggleStatus = async (p) => {
    const next = p.status === "active" ? "inactive" : "active";
    await base44.entities.ChitPlan.update(p.id, { status: next });
    logAudit({ module: "Chit Plans", action: "update", record_id: p.id, details: `Set plan "${p.plan_name}" to ${next}` });
    load();
  };

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const save = async () => {
    setSaving(true);
    const memberCount = +form.member_count;
    const isLakhBox = form.model === "lakhbox";
    const isLiveAuction = form.model === "live_auction";
    const chitAmountSymbol = form.currency === "CAD" ? "$" : "₹";
    const chitAmountLocale = form.currency === "CAD" ? "en-CA" : "en-IN";
    const payload = isLakhBox
      ? {
          ...form,
          plan_name: `${chitAmountSymbol}${Math.round(+form.chit_amount).toLocaleString(chitAmountLocale)} CashBox Plan`,
          member_count: memberCount,
          chit_amount: +form.chit_amount,
          monthly_contribution: Math.round(+form.chit_amount / memberCount),
          duration_months: memberCount,
          fixed_dividend: 0,
          commission_percent: 0,
          late_interest_percent: 0,
        }
      : isLiveAuction
      ? {
          ...form,
          plan_name: `${chitAmountSymbol}${Math.round(+form.chit_amount).toLocaleString(chitAmountLocale)} Live Auction Plan`,
          member_count: memberCount,
          chit_amount: +form.chit_amount,
          monthly_contribution: Math.round(+form.chit_amount / memberCount),
          duration_months: memberCount,
          fixed_dividend: 0,
          commission_percent: +form.commission_percent,
          late_interest_percent: 0,
          auction_min_decrement: +form.auction_min_decrement,
        }
      : { ...form, chit_amount: +form.chit_amount, member_count: memberCount, duration_months: +form.duration_months, monthly_contribution: +form.monthly_contribution, fixed_dividend: 0, commission_percent: +form.commission_percent, late_interest_percent: +form.late_interest_percent };
    if (editing === "new") {
      const created = await base44.entities.ChitPlan.create(payload);
      logAudit({ module: "Chit Plans", action: "create", record_id: created.id, details: `Created plan "${created.plan_name}" (${payload.model})` });
    } else {
      await base44.entities.ChitPlan.update(editing, payload);
      logAudit({ module: "Chit Plans", action: "update", record_id: editing, details: `Updated plan "${payload.plan_name}"` });
    }
    setSaving(false);
    setEditing(null);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-primary">Admin</p>
          <h1 className="text-3xl font-semibold text-foreground mt-1">Chit plans</h1>
        </div>
        <Button onClick={openNew} className="bg-primary hover:bg-primary/90 rounded-full">
          <Plus className="w-4 h-4 mr-1" /> New plan
        </Button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredPlans === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : filteredPlans.length === 0 ? (
          <p className="text-sm text-muted-foreground">No plans yet for this country. Create one.</p>
        ) : filteredPlans.map((p) => (
          <div key={p.id} className="bg-card rounded-2xl border border-border p-5 flex flex-col">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-foreground">{p.plan_name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{p.member_count} members · {p.duration_months} months</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{p.currency || "INR"}</span>
                <span
                  onDoubleClick={() => toggleStatus(p)}
                  title="Double-click to toggle active/inactive"
                  className={`text-xs px-2.5 py-1 rounded-full cursor-pointer select-none ${p.status === "active" ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground"}`}
                >
                  {p.status}
                </span>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-y-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Chit amount</p><p className="text-foreground tabular-nums">{formatMoney(p.chit_amount, p.currency)}</p></div>
              <div><p className="text-xs text-muted-foreground">Monthly</p><p className="text-foreground tabular-nums">{formatMoney(p.monthly_contribution, p.currency)}</p></div>
              {p.model === "lakhbox" ? (
                <>
                  <div><p className="text-xs text-muted-foreground">Model</p><p className="text-foreground">CashBox Rotation</p></div>
                  <div><p className="text-xs text-muted-foreground">Company label</p><p className="text-foreground">{p.company_label || "CashBox"}</p></div>
                </>
              ) : p.model === "live_auction" ? (
                <>
                  <div><p className="text-xs text-muted-foreground">Model</p><p className="text-foreground">Live Auction</p></div>
                  <div><p className="text-xs text-muted-foreground">Min decrement</p><p className="text-foreground tabular-nums">{formatMoney(p.auction_min_decrement, p.currency)}</p></div>
                </>
              ) : (
                <>
                  <div><p className="text-xs text-muted-foreground">Max Dividend</p><p className="text-foreground tabular-nums">{formatMoney(getMaxDividend(p), p.currency)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Fixed Commission</p><p className="text-foreground tabular-nums">{p.commission_percent}%</p></div>
                </>
              )}
            </div>
            <div className="mt-4 flex items-center gap-4">
              <button onClick={() => openEdit(p)} className="text-xs text-foreground flex items-center gap-1 hover:opacity-70">
                <Pencil className="w-3 h-3" /> Edit
              </button>
              <button onClick={() => setDeleteTarget(p)} className="text-xs text-destructive flex items-center gap-1 hover:opacity-70">
                <Trash2 className="w-3 h-3" /> Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing === "new" ? "Create chit plan" : "Edit plan"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            {form.model !== "lakhbox" && form.model !== "live_auction" && (
              <div className="col-span-2"><Label>Plan name</Label><Input value={form.plan_name} onChange={(e) => set("plan_name", e.target.value)} /></div>
            )}
            <div className="col-span-2">
              <Label>Plan model</Label>
              <Select value={form.model} onValueChange={(v) => set("model", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="chit_fund">Chit Fund — commission &amp; dividends</SelectItem>
                  <SelectItem value="lakhbox">CashBox Rotation — company keeps month 1, fixed payments</SelectItem>
                  <SelectItem value="live_auction">Live Auction — members bid each month, lowest bid wins</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={(v) => set("currency", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INR">₹ INR — Indian Rupee</SelectItem>
                  <SelectItem value="CAD">$ CAD — Canadian Dollar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.model === "lakhbox" ? (
              <>
                <div><Label>Chit amount</Label><Input type="number" value={form.chit_amount} onChange={(e) => set("chit_amount", e.target.value)} /></div>
                <div><Label>Members</Label><Input type="number" value={form.member_count} onChange={(e) => set("member_count", e.target.value)} /></div>
                <div className="col-span-2"><Label>Company label</Label><Input placeholder="CashBox" value={form.company_label} onChange={(e) => set("company_label", e.target.value)} /></div>
                <p className="col-span-2 text-xs text-muted-foreground -mt-2">
                  Duration is set automatically to {form.member_count || 0} months (one winner per month). Monthly contribution is derived as Chit amount ÷ Members. Plan name is generated automatically.
                </p>
              </>
            ) : form.model === "live_auction" ? (
              <>
                <div><Label>Chit amount</Label><Input type="number" value={form.chit_amount} onChange={(e) => set("chit_amount", e.target.value)} /></div>
                <div><Label>Members</Label><Input type="number" value={form.member_count} onChange={(e) => set("member_count", e.target.value)} /></div>
                <div><Label>Commission % (fixed)</Label><Input type="number" value={form.commission_percent} onChange={(e) => set("commission_percent", e.target.value)} /></div>
                <div><Label>Minimum decrement</Label><Input type="number" value={form.auction_min_decrement} onChange={(e) => set("auction_min_decrement", e.target.value)} /></div>
                <p className="col-span-2 text-xs text-muted-foreground -mt-2">
                  Duration is set automatically to {form.member_count || 0} months (one auction per month, month 1 is the company's allocation). Monthly contribution is derived as Chit amount ÷ Members. Plan name is generated automatically.
                </p>
              </>
            ) : (
              <>
                <div><Label>Chit amount</Label><Input type="number" value={form.chit_amount} onChange={(e) => set("chit_amount", e.target.value)} /></div>
                <div><Label>Members</Label><Input type="number" value={form.member_count} onChange={(e) => set("member_count", e.target.value)} /></div>
                <div><Label>Duration (months)</Label><Input type="number" value={form.duration_months} onChange={(e) => set("duration_months", e.target.value)} /></div>
                <div><Label>Monthly contribution</Label><Input type="number" value={form.monthly_contribution} onChange={(e) => set("monthly_contribution", e.target.value)} /></div>
                <div><Label>Commission % (fixed)</Label><Input type="number" value={form.commission_percent} onChange={(e) => set("commission_percent", e.target.value)} /></div>
                <div><Label>Late interest %</Label><Input type="number" value={form.late_interest_percent} onChange={(e) => set("late_interest_percent", e.target.value)} /></div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} className="rounded-full">Cancel</Button>
            <Button onClick={save} disabled={saving || (form.model === "chit_fund" && !form.plan_name)} className="bg-primary hover:bg-primary/90 rounded-full">{saving ? "Saving…" : "Save plan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete plan?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteTarget?.plan_name}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="rounded-full bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}