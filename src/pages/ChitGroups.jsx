import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Plus, UserCog, Trash2, Pencil } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import GroupMembersDialog from "@/components/GroupMembersDialog";
import { generateGroupCode, generateGroupName } from "@/lib/codeGenerator";
import { logAudit } from "@/lib/audit";
import { useAdminCountry } from "@/lib/AdminCountryContext";
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

const empty = { group_code: "", group_name: "", plan_id: "", branch: "", start_date: "", monthly_collection_date: 1, winner_selection_method: "recorded_random_draw", status: "active", whatsapp_group_link: "" };

export default function ChitGroups() {
  const [groups, setGroups] = useState(null);
  const [plans, setPlans] = useState([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [manageGroup, setManageGroup] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  // Shared with every other admin page via the header dropdown.
  const { country: countryFilter } = useAdminCountry();
  const { toast } = useToast();

  const load = () => base44.entities.ChitGroup.list("-created_date", 200).then(setGroups);
  useEffect(() => {
    load();
    base44.entities.ChitPlan.filter({ status: "active" }).then(setPlans);
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const openNew = () => { setForm(empty); setEditingId(null); setOpen(true); };
  const openEdit = (g) => {
    setForm({
      group_code: g.group_code || "",
      group_name: g.group_name || "",
      plan_id: g.plan_id || "",
      branch: g.branch || "",
      start_date: g.start_date || "",
      current_month: g.current_month ?? 1,
      filled_seats: g.filled_seats ?? 0,
      monthly_collection_date: g.monthly_collection_date || 1,
      winner_selection_method: g.winner_selection_method || "recorded_random_draw",
      status: g.status || "active",
      whatsapp_group_link: g.whatsapp_group_link || "",
    });
    setEditingId(g.id);
    setOpen(true);
  };
  const save = async () => {
    setSaving(true);
    try {
      const plan = plans.find((p) => p.id === form.plan_id);
      const currency = plan?.currency || "INR";
      const autoCode = editingId ? form.group_code : await generateGroupCode(currency).catch(() => form.group_code);
      const autoName = form.group_name || generateGroupName(plan?.plan_name || "Savings Group", form.branch, currency);
      const durationMonths = plan?.duration_months || 20;
      const endDate = form.start_date ? new Date(new Date(form.start_date).setMonth(new Date(form.start_date).getMonth() + durationMonths)).toISOString().slice(0, 10) : "";
      const payload = {
        group_code: autoCode,
        group_name: autoName,
        plan_id: form.plan_id,
        branch: form.branch || "",
        start_date: form.start_date || "",
        end_date: endDate,
        current_month: form.current_month ?? 1,
        filled_seats: form.filled_seats ?? 0,
        monthly_collection_date: form.monthly_collection_date || 1,
        winner_selection_method: form.winner_selection_method,
        status: form.status || "active",
        whatsapp_group_link: form.whatsapp_group_link || "",
      };
      if (editingId) {
        await base44.entities.ChitGroup.update(editingId, payload);
        logAudit({ module: "Savings Groups", action: "update", record_id: editingId, details: `Updated group "${payload.group_code}"` });
      } else {
        const created = await base44.entities.ChitGroup.create(payload);
        logAudit({ module: "Savings Groups", action: "create", record_id: created.id, details: `Created group "${created.group_code}" for plan "${planName(payload.plan_id)}"` });
      }
      toast({ title: editingId ? "Group updated" : "Group created" });
      setOpen(false);
      setForm(empty);
      setEditingId(null);
      load();
    } catch (e) {
      toast({ title: e.message || "Failed to save group", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await base44.entities.GroupMembership.deleteMany({ group_id: deleteTarget.id });
    await base44.entities.ChitGroup.delete(deleteTarget.id);
    logAudit({ module: "Savings Groups", action: "delete", record_id: deleteTarget.id, details: `Deleted group "${deleteTarget.group_code}"` });
    setDeleteTarget(null);
    load();
  };

  const planName = (id) => plans.find((p) => p.id === id)?.plan_name || "—";
  const planCapacity = (id) => plans.find((p) => p.id === id)?.member_count || 0;
  const groupCountry = (g) => (plans.find((p) => p.id === g.plan_id)?.currency === "CAD" ? "Canada" : "India");

  const statusTone = (s) => s === "active" ? "bg-emerald-500/15 text-emerald-400" : s === "completed" ? "bg-primary/15 text-primary" : "bg-rose-500/15 text-rose-400";

  const filteredGroups = (groups || []).filter((g) => groupCountry(g) === countryFilter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-primary">Admin</p>
          <h1 className="text-3xl font-semibold text-foreground mt-1">Savings groups</h1>
        </div>
        <Button onClick={openNew} className="bg-primary hover:bg-primary/90 rounded-full">
          <Plus className="w-4 h-4 mr-1" /> New group
        </Button>
      </div>

      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/70 text-muted-foreground text-xs uppercase tracking-wider">
              <tr>
              <th className="text-left px-5 py-3">Group code</th>
              <th className="text-left px-5 py-3">Name</th>
              <th className="text-left px-5 py-3">Plan</th>
              <th className="text-left px-5 py-3">Branch</th>
              <th className="text-left px-5 py-3">Start</th>
              <th className="text-left px-5 py-3">End</th>
              <th className="text-center px-5 py-3">Seats</th>
              <th className="text-right px-5 py-3">Status</th>
              <th className="text-right px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {groups === null ? (
                <tr><td colSpan={9} className="px-5 py-8 text-center text-muted-foreground">Loading…</td></tr>
              ) : filteredGroups.length === 0 ? (
                <tr><td colSpan={9} className="px-5 py-8 text-center text-muted-foreground">No groups match this filter.</td></tr>
              ) : filteredGroups.map((g) => (
                <tr key={g.id}>
                  <td className="px-5 py-3 font-medium text-foreground">{g.group_code}</td>
                  <td className="px-5 py-3 text-muted-foreground">{g.group_name || "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground">{planName(g.plan_id)}</td>
                  <td className="px-5 py-3 text-muted-foreground">{g.branch || "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground">{g.start_date || "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground">{g.end_date || "—"}</td>
                  <td className="px-5 py-3 text-center tabular-nums text-foreground">
                  {g.filled_seats || 0}{planCapacity(g.plan_id) ? `/${planCapacity(g.plan_id)}` : ""}
                </td>
                  <td className="px-5 py-3 text-right">
                    <span className={`text-xs px-2.5 py-1 rounded-full ${statusTone(g.status)}`}>{g.status}</span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setManageGroup(g)}
                        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-primary/5 text-foreground hover:bg-primary/10"
                      >
                        <UserCog className="w-3.5 h-3.5" /> Manage
                      </button>
                      <button
                        onClick={() => openEdit(g)}
                        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-muted text-muted-foreground hover:bg-muted/80"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </button>
                      <button
                        onClick={() => setDeleteTarget(g)}
                        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-rose-500/10 text-destructive hover:bg-rose-500/15"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingId ? "Edit group" : "Create chit group"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div><Label>Group code</Label><Input value={form.group_code} readOnly className="bg-muted text-muted-foreground" placeholder="Auto-generated on save" /></div>
            <div><Label>Group name</Label><Input value={form.group_name} onChange={(e) => set("group_name", e.target.value)} placeholder="Auto-generated if left blank" /></div>
            <div className="col-span-2">
              <Label>Plan</Label>
              <Select value={form.plan_id} onValueChange={(v) => set("plan_id", v)}>
                <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
                <SelectContent>
                  {plans
                    .filter((p) => ((p.currency || "INR") === "CAD" ? "Canada" : "India") === countryFilter)
                    .map((p) => <SelectItem key={p.id} value={p.id}>{p.plan_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Branch</Label><Input value={form.branch} onChange={(e) => set("branch", e.target.value)} placeholder="Scarborough" /></div>
            <div><Label>Start date</Label><Input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} /></div>
            <div>
              <Label>Monthly collection date</Label>
              <Input type="number" min="1" max="31" value={form.monthly_collection_date} onChange={(e) => set("monthly_collection_date", Number(e.target.value))} />
            </div>
            <div>
              <Label>Winner selection method</Label>
              <Select value={form.winner_selection_method} onValueChange={(v) => set("winner_selection_method", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin_selection">Admin Selection</SelectItem>
                  <SelectItem value="recorded_random_draw">Recorded Random Draw</SelectItem>
                  <SelectItem value="manual_selection">Approved Manual Selection</SelectItem>
                  <SelectItem value="live_auction_placeholder">Live Auction (Coming Soon)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>WhatsApp group invite link</Label>
              <Input
                value={form.whatsapp_group_link}
                onChange={(e) => set("whatsapp_group_link", e.target.value)}
                placeholder="https://chat.whatsapp.com/..."
              />
              <p className="text-xs text-muted-foreground mt-1">
                Create the group in WhatsApp, then paste its invite link here — new members get sent this automatically when approved.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-full">Cancel</Button>
            <Button onClick={save} disabled={saving || !form.plan_id} className="bg-primary hover:bg-primary/90 rounded-full">{saving ? "Saving…" : editingId ? "Save changes" : "Create group"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <GroupMembersDialog
        group={manageGroup}
        plan={plans.find((p) => p.id === manageGroup?.plan_id)}
        onClose={() => { setManageGroup(null); load(); }}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete group?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteTarget?.group_name || deleteTarget?.group_code}" and remove all its member assignments. This action cannot be undone.
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