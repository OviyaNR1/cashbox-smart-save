import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MessageCircle, Send, CheckCircle2, Users } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useAdminCountry } from "@/lib/AdminCountryContext";

const TEMPLATES = {
  payment_reminder: {
    body: "Dear Member,\n\nThis is a friendly reminder that your monthly chit installment is now due. Please make your payment at your earliest convenience to avoid late fees.\n\nThank you,\nCashBox Team",
  },
  winner_announcement: {
    body: "Dear Member,\n\nWe are pleased to announce the winner for this month's chit cycle. Please log in to your CashBox dashboard for full details.\n\nCongratulations to the winner!\n\nCashBox Team",
  },
  kyc_reminder: {
    body: "Dear Member,\n\nYour KYC verification is still pending. Please complete your KYC submission at the earliest to avoid any disruption in your chit participation.\n\nCashBox Team",
  },
  custom: { body: "" },
};

export default function Notifications() {
  const { toast } = useToast();
  const { country: countryFilter } = useAdminCountry();
  const [members, setMembers] = useState([]);
  const [recipients, setRecipients] = useState("all");
  const [template, setTemplate] = useState("payment_reminder");
  const [body, setBody] = useState(TEMPLATES.payment_reminder.body);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);

  useEffect(() => {
    base44.entities.MemberProfile.list("-created_date", 500).then(setMembers);
  }, []);

  // Reset off a specific-member pick when the country switches, so a
  // message can't silently end up targeting someone from the other market.
  useEffect(() => { setRecipients("all"); }, [countryFilter]);

  // "Send to all" must never cross markets — scoping here, once, keeps
  // every downstream target list (all/pending KYC/individual picker)
  // correct without repeating the check at each usage.
  const registered = members.filter((m) => m.mobile && (m.country || "India") === countryFilter);
  const targetCount = recipients === "all" ? registered.length : recipients === "pending_kyc" ? registered.filter((m) => m.kyc_status === "pending").length : 1;

  const onTemplate = (key) => {
    setTemplate(key);
    setBody(TEMPLATES[key].body);
  };

  const getTargets = () => {
    if (recipients === "all") return registered;
    if (recipients === "pending_kyc") return registered.filter((m) => m.kyc_status === "pending");
    // Search registered (country-scoped), not the full members list — if the
    // country switch happened after picking someone, a stale ID from the
    // other market must not resolve back into a valid send target.
    const m = registered.find((x) => x.id === recipients);
    return m ? [m] : [];
  };

  const send = async () => {
    if (!body.trim()) {
      toast({ title: "Message is required", variant: "destructive" });
      return;
    }
    const targets = getTargets();
    if (targets.length === 0) {
      toast({ title: "No registered recipients with a mobile number", variant: "destructive" });
      return;
    }
    setSending(true);
    let ok = 0;
    let fail = 0;
    for (const m of targets) {
      try {
        // Use payment_reminder template for payment reminders; fall back to text for custom/other templates
        if (template === "payment_reminder") {
          await base44.functions.invoke("sendWhatsApp", { phone: m.mobile, template: "payment_reminder" });
        } else {
          await base44.functions.invoke("sendWhatsApp", { phone: m.mobile, message: body });
        }
        ok++;
      } catch {
        fail++;
      }
    }
    setSending(false);
    setSent({ ok, fail, total: targets.length });
    toast({ title: `Sent to ${ok} member${ok !== 1 ? "s" : ""}`, description: fail ? `${fail} failed` : undefined });
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-primary">Admin</p>
        <h1 className="text-3xl font-semibold text-foreground mt-1">Notifications</h1>
      </div>

      <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-start gap-3">
        <MessageCircle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
        <p className="text-sm text-amber-300">
          WhatsApp reaches <strong>members with a registered mobile number</strong>. {members.length - registered.length} member(s) without one will be skipped.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-card rounded-2xl border border-border p-6 space-y-5">
          <div>
            <Label className="text-sm text-foreground">Template</Label>
            <Select value={template} onValueChange={onTemplate}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="payment_reminder">Payment reminder</SelectItem>
                <SelectItem value="winner_announcement">Winner announcement</SelectItem>
                <SelectItem value="kyc_reminder">KYC reminder</SelectItem>
                <SelectItem value="custom">Custom message</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm text-foreground">Message</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} className="mt-1.5 resize-none" placeholder="Write your WhatsApp message…" />
          </div>
          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-muted-foreground">Recipients with mobile number: {registered.length}</p>
            <Button onClick={send} disabled={sending} className="bg-primary hover:bg-primary/90 rounded-full">
              <Send className="w-4 h-4 mr-1.5" /> {sending ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
          <p className="text-sm font-medium text-foreground flex items-center gap-2"><Users className="w-4 h-4 text-foreground" /> Recipients</p>
          <div className="space-y-2">
            <label className="flex items-center gap-3 p-3 rounded-xl border border-border cursor-pointer hover:border-primary/30">
              <input type="radio" name="rec" checked={recipients === "all"} onChange={() => setRecipients("all")} className="accent-[#ffb833]" />
              <div>
                <p className="text-sm text-foreground">All members</p>
                <p className="text-xs text-muted-foreground">{registered.length} with mobile number</p>
              </div>
            </label>
            <label className="flex items-center gap-3 p-3 rounded-xl border border-border cursor-pointer hover:border-primary/30">
              <input type="radio" name="rec" checked={recipients === "pending_kyc"} onChange={() => setRecipients("pending_kyc")} className="accent-[#ffb833]" />
              <div>
                <p className="text-sm text-foreground">Pending KYC only</p>
                <p className="text-xs text-muted-foreground">{registered.filter((m) => m.kyc_status === "pending").length} members</p>
              </div>
            </label>
            <div className="p-3 rounded-xl border border-border">
              <p className="text-sm text-foreground mb-2">Specific member</p>
              <Select value={recipients.startsWith("mem:") ? recipients.slice(4) : ""} onValueChange={(v) => setRecipients(v)}>
                <SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger>
                <SelectContent>
                  {registered.map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name} ({m.mobile})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground">Will send to</p>
            <p className="text-2xl font-semibold text-foreground">{targetCount} <span className="text-sm font-normal text-muted-foreground">recipient(s)</span></p>
          </div>
          {sent && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <p className="text-sm text-emerald-400">{sent.ok} sent{sent.fail ? `, ${sent.fail} failed` : ""}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
