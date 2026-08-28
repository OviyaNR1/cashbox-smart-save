import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MessageCircle, Send, CheckCircle2, Users } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useAdminCountry } from "@/lib/AdminCountryContext";
import { sendWhatsAppMessage } from "@/lib/sendWhatsAppMessage";

const TEMPLATES = {
  payment_reminder: {
    body: "Dear Member,\n\nThis is a friendly reminder that your monthly chit installment is now due. Please make your payment at your earliest convenience to avoid late fees.\n\nThank you,\nCashBox Team",
    isTemplate: true,
    params: [],
  },
  payment_reminder_overdue_v2: {
    body: "Member Name, Days Overdue, Breakdown, Total Amount Due",
    isTemplate: true,
    params: ["memberName", "daysOverdue", "breakdown", "totalAmount"],
  },
  payment_reminder_urgent_v2: {
    body: "Member Name, Days Late, Breakdown, Late Fee, Total Amount Due",
    isTemplate: true,
    params: ["memberName", "daysLate", "breakdown", "lateFee", "totalAmount"],
  },
  winner_announcement_all_v2: {
    body: "Winner Name, Month, Prize Amount, Dividend, Next Installment",
    isTemplate: true,
    params: ["winnerName", "month", "prizeAmount", "dividend", "nextInstallment"],
  },
  winner_announcement_winner: {
    body: "Winner Name, Month, Prize Amount, Dividend, Next Installment (personalized to winner)",
    isTemplate: true,
    params: ["winnerName", "month", "prizeAmount", "dividend", "nextInstallment"],
  },
  auction_reminder: {
    body: "Member Name, Auction Date, Group Name, Auction Link",
    isTemplate: true,
    params: ["memberName", "auctionDate", "groupName", "auctionLink"],
  },
  kyc_reminder: {
    body: "Dear Member,\n\nYour KYC verification is still pending. Please complete your KYC submission at the earliest to avoid any disruption in your chit participation.\n\nCashBox Team",
    isTemplate: false,
  },
  custom: { body: "", isTemplate: false },
};

export default function Notifications() {
  const { toast } = useToast();
  const { country: countryFilter } = useAdminCountry();
  const [members, setMembers] = useState([]);
  const [recipients, setRecipients] = useState("all");
  const [template, setTemplate] = useState("payment_reminder");
  const [body, setBody] = useState(TEMPLATES.payment_reminder.body);
  const [templateParams, setTemplateParams] = useState({});
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
    setTemplateParams({});
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
    const tmpl = TEMPLATES[template];
    if (!tmpl.isTemplate && !body.trim()) {
      toast({ title: "Message is required", variant: "destructive" });
      return;
    }
    if (tmpl.isTemplate && tmpl.params?.length > 0 && Object.keys(templateParams).length === 0) {
      toast({ title: "Please fill in all template parameters", variant: "destructive" });
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
        const payload = { phone: m.mobile };
        if (tmpl.isTemplate) {
          payload.templateName = template;
          payload.parameters = Object.values(templateParams);
        } else {
          payload.message = body;
        }
        await sendWhatsAppMessage(payload);
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
                <SelectItem value="payment_reminder">Payment reminder (static)</SelectItem>
                <SelectItem value="payment_reminder_overdue_v2">Payment reminder - Overdue</SelectItem>
                <SelectItem value="payment_reminder_urgent_v2">Payment reminder - Urgent</SelectItem>
                <SelectItem value="winner_announcement_all_v2">Winner announcement (all members)</SelectItem>
                <SelectItem value="winner_announcement_winner">Winner announcement (personalized)</SelectItem>
                <SelectItem value="auction_reminder">Auction reminder</SelectItem>
                <SelectItem value="kyc_reminder">KYC reminder</SelectItem>
                <SelectItem value="custom">Custom message</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {TEMPLATES[template]?.isTemplate && (
            <div className="space-y-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
              <p className="text-xs text-muted-foreground font-semibold">Template Parameters</p>
              {TEMPLATES[template].params?.map((param) => (
                <div key={param}>
                  <Label className="text-xs text-foreground capitalize">{param.replace(/([A-Z])/g, " $1").trim()}</Label>
                  <input
                    type="text"
                    value={templateParams[param] || ""}
                    onChange={(e) => setTemplateParams({ ...templateParams, [param]: e.target.value })}
                    placeholder={`Enter ${param}`}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
                  />
                </div>
              ))}
            </div>
          )}
          {!TEMPLATES[template]?.isTemplate && (
            <div>
              <Label className="text-sm text-foreground">Message</Label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} className="mt-1.5 resize-none" placeholder="Write your WhatsApp message…" />
            </div>
          )}
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
              <Select value={recipients.includes("-") ? recipients : ""} onValueChange={(v) => setRecipients(v)}>
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
