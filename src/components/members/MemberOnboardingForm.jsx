import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { sendWhatsAppMessage } from "@/lib/sendWhatsAppMessage";

const empty = {
  full_name: "", address: "", city: "", state: "", pin_code: "", mobile: "", phone: "", email: "",
  dob: "", gender: "female", member_code: "", group_id: "", branch: "",
  aadhaar_number: "", pan_number: "",
  guarantor_name: "", guarantor_mobile: "", guarantor_relationship: "", guarantor_email: "",
};

export default function MemberOnboardingForm({ open, onClose, onSaved, member }) {
  const [form, setForm] = useState(empty);
  const [groups, setGroups] = useState([]);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      if (member) {
        setForm({ ...empty, ...member, group_id: member.group_id || "" });
      } else {
        setForm(empty);
      }
      base44.entities.ChitGroup.list().then(setGroups).catch(() => {});
    }
  }, [open, member]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.full_name) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { group_id, ...profileFields } = form;
      const payload = {
        ...profileFields,
        // This form only collects India-specific fields (Aadhaar/PAN,
        // state/PIN) — must set this explicitly, since the member_profiles
        // table itself defaults the country column to Canada, which would
        // otherwise silently mislabel every member added here.
        country: member?.country || "India",
        kyc_stage: member?.kyc_stage || "registration",
        kyc_status: member?.kyc_status || "pending",
        gender: form.gender || "female",
      };

      let memberId = member?.id;

      if (member) {
        await base44.entities.MemberProfile.update(member.id, payload);
      } else {
        const created = await base44.entities.MemberProfile.create(payload);
        memberId = created.id;

        if (form.group_id) {
          const group = groups.find((g) => g.id === form.group_id);
          await base44.entities.GroupMembership.create({
            group_id: form.group_id,
            member_profile_id: memberId,
            status: "active",
            paid_installments: 0,
            total_paid: 0,
          });
          if (group) {
            await base44.entities.ChitGroup.update(group.id, {
              filled_seats: (group.filled_seats || 0) + 1,
            });
          }
        }

        if (form.mobile) {
          const regUrl = `${window.location.origin}/register`;
          try {
            // Free-form text only reaches numbers that messaged the business
            // in the last 24 hours — this is always a first-contact message
            // to a brand-new member, so it has to be an approved template.
            await sendWhatsAppMessage({
              phone: form.mobile,
              templateName: "member_invite_v4",
              parameters: [form.full_name, regUrl],
            });
          } catch (e) {
            /* WhatsApp optional */
          }
        }
      }

      toast({ title: member ? "Member updated" : "Member onboarded" });
      onSaved();
      onClose();
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{member ? "Edit member" : "Onboard new member"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Full name *</Label>
            <Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="Member name" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date of birth</Label>
              <Input type="date" value={form.dob} onChange={(e) => set("dob", e.target.value)} />
            </div>
            <div>
              <Label>Gender</Label>
              <Select value={form.gender} onValueChange={(v) => set("gender", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Address</Label>
            <Input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Street address" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>City</Label>
              <Input value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Your city" />
            </div>
            <div>
              <Label>State</Label>
              <Input value={form.state} onChange={(e) => set("state", e.target.value)} placeholder="Kerala" />
            </div>
            <div>
              <Label>PIN code</Label>
              <Input value={form.pin_code} onChange={(e) => set("pin_code", e.target.value)} placeholder="686001" />
            </div>
          </div>

          <div>
            <Label>WhatsApp number</Label>
            <Input value={form.mobile} onChange={(e) => set("mobile", e.target.value)} placeholder="+1..." />
          </div>

          <div>
            <Label>Phone number (if different from WhatsApp)</Label>
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="Optional" />
          </div>

          <div>
            <Label>Email (optional)</Label>
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@example.com" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Member code</Label>
              <Input value={form.member_code} readOnly className="bg-muted text-muted-foreground" />
            </div>
            <div>
              <Label>Branch</Label>
              <Input value={form.branch} onChange={(e) => set("branch", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Aadhaar number</Label>
              <Input value={form.aadhaar_number} onChange={(e) => set("aadhaar_number", e.target.value)} placeholder="1234 5678 9012" />
            </div>
            <div>
              <Label>PAN number</Label>
              <Input value={form.pan_number} onChange={(e) => set("pan_number", e.target.value)} placeholder="ABCDE1234F" />
            </div>
          </div>

          <div className="pt-2 border-t border-border">
            <p className="text-sm font-medium text-foreground mb-3">Guarantor</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Guarantor name</Label>
                <Input value={form.guarantor_name} onChange={(e) => set("guarantor_name", e.target.value)} placeholder="Guarantor full name" />
              </div>
              <div>
                <Label>Relationship</Label>
                <Input value={form.guarantor_relationship} onChange={(e) => set("guarantor_relationship", e.target.value)} placeholder="Spouse, Parent, Sibling…" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <Label>Guarantor phone</Label>
                <Input value={form.guarantor_mobile} onChange={(e) => set("guarantor_mobile", e.target.value)} placeholder="+91..." />
              </div>
              <div>
                <Label>Guarantor email</Label>
                <Input type="email" value={form.guarantor_email} onChange={(e) => set("guarantor_email", e.target.value)} placeholder="guarantor@email.com" />
              </div>
            </div>
          </div>

          <div>
            <Label>Group / Plan</Label>
            <Select value={form.group_id} onValueChange={(v) => set("group_id", v)}>
              <SelectTrigger><SelectValue placeholder="Select a group (optional)" /></SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.group_name || g.group_code}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="rounded-full">Cancel</Button>
          <Button
            onClick={submit}
            disabled={saving || !form.full_name}
            className="rounded-full bg-primary hover:bg-primary/90"
          >
            {saving ? "Saving…" : member ? "Update" : "Onboard member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}