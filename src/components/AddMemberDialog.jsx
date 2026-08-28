import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Send } from "lucide-react";
import { sendWhatsAppMessage } from "@/lib/sendWhatsAppMessage";

const empty = {
  full_name: "", mobile: "", email: "", branch: "", member_code: "",
  guarantor_name: "", guarantor_mobile: "", guarantor_relationship: "", guarantor_address: "",
};

export default function AddMemberDialog({ open, onClose, onAdded }) {
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setSaving(true);
    try {
      await base44.entities.MemberProfile.create({
        ...form,
        kyc_status: "pending",
        guarantor_status: form.guarantor_name ? "pending" : "pending",
      });

      const regUrl = `${window.location.origin}/register`;
      try {
        // Free-form text only reaches numbers that messaged the business in
        // the last 24 hours — this is always a first-contact message to a
        // brand-new member, so it has to be an approved template.
        await sendWhatsAppMessage({
          phone: form.mobile,
          templateName: "member_invite_v2",
          parameters: [form.full_name, regUrl],
        });
        toast({ title: "Member added", description: `${form.full_name} added and WhatsApp invite sent.` });
      } catch (e) {
        toast({ title: "Member added", description: `${form.full_name} added, but WhatsApp invite failed — configure WhatsApp in settings.` });
      }

      setForm(empty);
      onAdded();
      onClose();
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Add member</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="col-span-2"><Label>Full name *</Label><Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="Rajesh Kumar" /></div>
          <div><Label>Mobile (WhatsApp) *</Label><Input value={form.mobile} onChange={(e) => set("mobile", e.target.value)} placeholder="919876543210" /></div>
          <div><Label>Email</Label><Input value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
          <div><Label>Member code</Label><Input value={form.member_code} onChange={(e) => set("member_code", e.target.value)} placeholder="LB-M001" /></div>
          <div><Label>Branch</Label><Input value={form.branch} onChange={(e) => set("branch", e.target.value)} placeholder="Chennai Main" /></div>

          <div className="col-span-2 mt-2">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Guarantor details</p>
          </div>
          <div><Label>Guarantor name</Label><Input value={form.guarantor_name} onChange={(e) => set("guarantor_name", e.target.value)} /></div>
          <div><Label>Guarantor mobile</Label><Input value={form.guarantor_mobile} onChange={(e) => set("guarantor_mobile", e.target.value)} /></div>
          <div><Label>Relationship</Label><Input value={form.guarantor_relationship} onChange={(e) => set("guarantor_relationship", e.target.value)} placeholder="Brother" /></div>
          <div><Label>Guarantor address</Label><Input value={form.guarantor_address} onChange={(e) => set("guarantor_address", e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="rounded-full">Cancel</Button>
          <Button onClick={submit} disabled={saving || !form.full_name || !form.mobile} className="bg-primary hover:bg-primary/90 rounded-full">
            {saving ? "Adding…" : <><Send className="w-4 h-4 mr-1" /> Add & invite</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}