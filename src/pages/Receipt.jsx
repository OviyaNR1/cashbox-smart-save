import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { ArrowLeft, Printer, Download, MessageCircle } from "lucide-react";
import { formatMoney } from "@/lib/currency";
import { generateInvoicePdf, buildInvoiceNumber } from "@/lib/pdf";

export default function Receipt() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const payment = await base44.entities.Payment.get(id);
        const [prof, grp] = await Promise.all([
          payment.member_profile_id ? base44.entities.MemberProfile.get(payment.member_profile_id) : Promise.resolve(null),
          payment.group_id ? base44.entities.ChitGroup.get(payment.group_id) : Promise.resolve(null),
        ]);
        let planObj = null;
        if (grp?.plan_id) planObj = await base44.entities.ChitPlan.get(grp.plan_id);

        const dividends = payment.group_id && payment.member_profile_id
          ? await base44.entities.Dividend.filter({ group_id: payment.group_id, member_profile_id: payment.member_profile_id, month_number: payment.installment_number }).catch(() => [])
          : [];
        const dividendAmount = dividends?.[0]?.amount || 0;

        setData({ payment, prof, grp, plan: planObj, dividendAmount });
      } catch (e) {
        setError(e.message || "Could not load this receipt.");
      }
    })();
  }, [id]);

  if (error) return (
    <div className="max-w-2xl mx-auto">
      <Link to="/payments" className="text-sm text-muted-foreground flex items-center gap-1 hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Back to Payments
      </Link>
      <div className="mt-8 bg-card rounded-2xl border border-border p-8 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <p className="text-xs text-muted-foreground mt-2">The receipt may have been removed or is no longer accessible.</p>
      </div>
    </div>
  );

  if (!data) return <div className="h-64 grid place-items-center text-muted-foreground text-sm">Loading receipt…</div>;
  const { payment: p, prof, grp, plan, dividendAmount, remainingBalance } = data;
  const cur = p.currency || plan?.currency || "INR";

  const downloadPdf = async () => {
    setSending("pdf");
    try {
      await generateInvoicePdf({ payment: p, member: prof, group: grp, plan, dividendAmount, remainingBalance });
    } catch (e) {
      toast({ title: "Could not generate PDF", description: e.message, variant: "destructive" });
    }
    setSending("");
  };

  const sendViaWhatsApp = async () => {
    setSending("whatsapp");
    try {
      const receiptUrl = `${window.location.origin}/receipt/${p.id}`;
      const message = `Your CashBox receipt for installment #${p.installment_number || "—"} (${formatMoney(p.amount, cur)}) is ready: ${receiptUrl}`;
      if (!prof?.mobile) throw new Error("This member has no phone number on file.");
      await base44.functions.invoke("sendWhatsApp", { phone: prof.mobile, message });
      toast({ title: "Sent via WhatsApp" });
    } catch (e) {
      toast({ title: "Could not send", description: e.message, variant: "destructive" });
    }
    setSending("");
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <Link to="/payments" className="text-sm text-muted-foreground flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Back to Payments
        </Link>
        <div className="flex items-center gap-2">
          <Button onClick={downloadPdf} disabled={!!sending} className="rounded-full bg-primary hover:bg-primary/90">
            <Download className="w-4 h-4 mr-1" /> {sending === "pdf" ? "Generating…" : "Download PDF"}
          </Button>
          <Button onClick={sendViaWhatsApp} disabled={!!sending} variant="outline" className="rounded-full">
            <MessageCircle className="w-4 h-4 mr-1" /> WhatsApp
          </Button>
          <Button onClick={() => window.print()} variant="outline" className="rounded-full">
            <Printer className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border p-8 print:shadow-none print:border-0">
        <div className="flex items-start justify-between pb-6 border-b border-border">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-lg bg-primary grid place-items-center text-primary-foreground font-bold text-lg">C</span>
            <div>
              <p className="font-semibold text-foreground">CashBox</p>
              <p className="text-xs text-muted-foreground">Digital Chit Management</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Invoice</p>
            <p className="text-sm font-medium text-foreground mt-1">{buildInvoiceNumber({ group: grp, payment: p })}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-y-4 py-6 text-sm">
          <div><p className="text-xs text-muted-foreground">Member</p><p className="text-foreground">{prof?.full_name || "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Member code</p><p className="text-foreground">{prof?.member_code || "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Group</p><p className="text-foreground">{grp?.group_code || "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Plan</p><p className="text-foreground">{plan?.plan_name || "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Installment</p><p className="text-foreground">#{p.installment_number || "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Payment date</p><p className="text-foreground">{p.payment_date || "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Method</p><p className="text-foreground capitalize">{(p.method || "").replace("_", " ")}</p></div>
          <div><p className="text-xs text-muted-foreground">Status</p>
            <span className={`text-xs px-2.5 py-1 rounded-full ${p.status === "success" ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}>{p.status}</span>
          </div>
        </div>

        <div className="border-t border-border pt-6 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Installment amount</span>
            <span className="tabular-nums text-foreground">{formatMoney(p.amount, cur)}</span>
          </div>
          {p.late_fee > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Late fee</span>
              <span className="tabular-nums text-foreground">{formatMoney(p.late_fee, cur)}</span>
            </div>
          )}
          {dividendAmount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Dividend credited</span>
              <span className="tabular-nums text-primary">{formatMoney(dividendAmount, cur)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-semibold pt-2 border-t border-border">
            <span className="text-foreground">Total paid</span>
            <span className="tabular-nums text-emerald-400">{formatMoney((p.amount || 0) + (p.late_fee || 0), cur)}</span>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">This is a system-generated receipt. Collected by {p.collected_by || "CashBox admin"}.</p>
      </div>
    </div>
  );
}