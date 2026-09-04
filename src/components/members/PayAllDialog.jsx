import React, { useState, useEffect, useMemo, useRef } from "react";
import { base44 } from "@/api/base44Client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { formatMoney } from "@/lib/currency";
import FileUpload from "@/components/members/FileUpload";
import { buildUpiPaymentLink, BUSINESS_UPI_ID } from "@/lib/upi";
import { Loader2, CreditCard, Smartphone, Copy } from "lucide-react";
import QRCode from "qrcode";

const PAYMENT_METHODS = [
  { value: "upi", label: "UPI" },
  { value: "cash", label: "Cash" },
];
const METHODS_WITH_PROOF = ["upi", "bank_transfer"];

// Cart-style checkout across every unpaid installment a member has, across
// all of their tickets and groups at once — instead of paying one ticket's
// installments at a time (PayInstallmentDialog), this is the "select what
// you want to pay, see one total, submit once" flow off the Dashboard's
// consolidated "Total Due" summary.
export default function PayAllDialog({ open, onOpenChange, items, user, onPaid }) {
  const [method, setMethod] = useState("upi");
  const [reference, setReference] = useState("");
  const [screenshotPath, setScreenshotPath] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const { toast } = useToast();
  // See PayInstallmentDialog.jsx for why this ref (not the submitting
  // state, which only updates on the next render) is what actually stops a
  // double-tap from bulkCreate-ing the same payments twice.
  const submitLockRef = useRef(false);
  const [qrDataUrl, setQrDataUrl] = useState("");

  // Every item defaults to selected whenever the dialog opens with a new
  // item set — matches PayInstallmentDialog's own default-all-selected
  // behavior for a single ticket.
  useEffect(() => {
    if (!open) {
      setReference("");
      setScreenshotPath("");
      return;
    }
    setSelected(new Set((items || []).map((i) => i.key)));
  }, [open, items]);

  const allItems = items || [];
  const chosen = allItems.filter((i) => selected.has(i.key));

  // Almost every member only ever holds INR tickets (Canada is launched but
  // hidden), but nothing stops one person holding tickets in both — total
  // per currency instead of silently adding CAD to INR.
  const totalsByCurrency = useMemo(() => {
    const totals = {};
    chosen.forEach((i) => {
      totals[i.currency] = (totals[i.currency] || 0) + i.amount;
    });
    return totals;
  }, [chosen]);
  const currencies = Object.keys(totalsByCurrency);
  const singleCurrency = currencies.length === 1 ? currencies[0] : null;
  const totalDisplay = currencies.length
    ? currencies.map((c) => formatMoney(totalsByCurrency[c], c)).join(" + ")
    : formatMoney(0, "INR");

  const toggle = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const copyUpiId = () => {
    navigator.clipboard?.writeText(BUSINESS_UPI_ID)
      .then(() => toast({ title: "UPI ID copied", description: "Paste it in your UPI app to pay." }))
      .catch(() => toast({ title: "Couldn't copy", description: BUSINESS_UPI_ID, variant: "destructive" }));
  };

  // See PayInstallmentDialog.jsx for why scanning is more reliable than
  // either the deep-link button or manual copy-paste.
  useEffect(() => {
    if (method !== "upi" || singleCurrency !== "INR" || !totalsByCurrency.INR) { setQrDataUrl(""); return; }
    let active = true;
    QRCode.toDataURL(
      buildUpiPaymentLink({ amount: totalsByCurrency.INR, note: `CashBox Installments x${chosen.length}` }),
      { margin: 1, width: 220 }
    )
      .then((url) => { if (active) setQrDataUrl(url); })
      .catch(() => { if (active) setQrDataUrl(""); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, singleCurrency, totalsByCurrency.INR]);

  const screenshotMissing = method === "upi" && !screenshotPath;

  const handleSubmit = async () => {
    if (!chosen.length || screenshotMissing || submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitting(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await base44.entities.Payment.bulkCreate(
        chosen.map((i) => ({
          user_id: user?.id,
          membership_id: i.membership.id,
          member_profile_id: i.membership.member_profile_id,
          group_id: i.membership.group_id,
          installment_number: i.number,
          amount: i.amount,
          payment_date: today,
          method,
          currency: i.currency,
          status: "pending",
          confirmation_number: method !== "cash" ? (reference || undefined) : undefined,
          etransfer_screenshot_url: METHODS_WITH_PROOF.includes(method) ? (screenshotPath || undefined) : undefined,
        }))
      );
      toast({
        title: chosen.length > 1 ? `${chosen.length} payments submitted!` : "Payment submitted!",
        description: "An admin will confirm receipt shortly.",
      });
      onOpenChange(false);
      if (onPaid) onPaid();
    } catch (e) {
      toast({ title: e.message || "Payment failed", variant: "destructive" });
    }
    submitLockRef.current = false;
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary" /> Pay Installments
          </DialogTitle>
          <DialogDescription>
            Everything you currently owe, across all your tickets — pick what you want to pay now.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {allItems.length === 0 ? (
            <div className="bg-muted/30 rounded-xl p-4 text-sm text-muted-foreground text-center">
              You're fully paid up — nothing due right now.
            </div>
          ) : (
            <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
              {allItems.map((item) => (
                <label
                  key={item.key}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(item.key)}
                    onChange={() => toggle(item.key)}
                    className="w-4 h-4 accent-[#ffb833] shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {item.group?.group_name || item.group?.group_code}
                      {item.membership.chit_number || item.membership.ticket_number ? ` · Chit #${item.membership.chit_number || item.membership.ticket_number}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Installment #{item.number} · {item.dueDate ? `Due ${item.dueDate}` : "—"}
                    </p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums text-foreground shrink-0">
                    {formatMoney(item.amount, item.currency)}
                  </p>
                </label>
              ))}
              <div className="px-4 py-3 bg-muted/30 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">Total Amount</span>
                  <span className="text-xl font-bold text-primary tabular-nums">{totalDisplay}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {chosen.length} of {allItems.length} installment{allItems.length > 1 ? "s" : ""} selected
                </p>
              </div>
            </div>
          )}

          {allItems.length > 0 && (
            <>
              <div>
                <Label className="text-xs">Payment Method</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {method === "upi" && chosen.length > 0 && singleCurrency === "INR" && (
                <a
                  href={buildUpiPaymentLink({
                    amount: totalsByCurrency.INR,
                    note: `CashBox Installments x${chosen.length}`,
                  })}
                  className="flex items-center justify-center gap-2 w-full h-10 rounded-lg border border-primary/30 bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/15 transition-colors"
                >
                  <Smartphone className="w-4 h-4" /> Pay {totalDisplay} via UPI App
                </a>
              )}

              {method === "upi" && qrDataUrl && (
                <div className="rounded-lg border border-border p-4 flex flex-col items-center gap-2">
                  <p className="text-xs font-medium text-foreground">Or scan to pay directly</p>
                  <img src={qrDataUrl} alt="Scan to pay via UPI" className="w-40 h-40 rounded-md" />
                  <p className="text-xs text-muted-foreground text-center">
                    Open your UPI app's scanner (or your phone's camera) and point it here.
                  </p>
                </div>
              )}

              {method === "upi" && (
                <div className="rounded-lg border border-border p-3 space-y-2">
                  <p className="text-xs font-medium text-foreground">
                    Button and QR above not working? Pay manually instead:
                  </p>
                  <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                    <li>Open your UPI app (PhonePe, Google Pay, Paytm, etc.)</li>
                    <li>Choose "Pay to UPI ID" or "Send money" and enter the ID below</li>
                    <li>Enter {totalDisplay} and complete the payment</li>
                  </ol>
                  {/* The copy button alone isn't enough — clipboard access can
                      silently fail (older browsers, missing permission, no
                      HTTPS), and even when it works, a member can't visually
                      verify or manually type an ID they never actually saw. */}
                  <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-2">
                    <code className="flex-1 min-w-0 text-xs font-medium text-foreground truncate select-all">{BUSINESS_UPI_ID}</code>
                    <button
                      type="button"
                      onClick={copyUpiId}
                      className="shrink-0 inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-border text-xs font-medium text-foreground hover:bg-muted"
                    >
                      <Copy className="w-3 h-3" /> Copy
                    </button>
                  </div>
                </div>
              )}

              {method !== "cash" && (
                <>
                  <div>
                    <Label className="text-xs">Reference / Confirmation #</Label>
                    <Input
                      className="mt-1"
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      placeholder="Enter reference number"
                    />
                  </div>
                  <FileUpload
                    label={method === "upi" ? "Payment screenshot (required)" : "Payment screenshot (optional)"}
                    value={screenshotPath}
                    onChange={setScreenshotPath}
                    bucket="payment-proofs"
                  />
                  {method === "upi" && (
                    <p className="text-xs text-muted-foreground -mt-2">A screenshot is required for UPI payments.</p>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-full">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !chosen.length || screenshotMissing}
            className="rounded-full bg-primary hover:bg-primary/90"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Submitting…
              </>
            ) : screenshotMissing ? (
              "Attach a screenshot to submit"
            ) : chosen.length > 1 ? (
              `Submit ${chosen.length} Payments`
            ) : (
              "Submit Payment"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
