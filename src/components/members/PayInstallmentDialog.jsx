import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { getNextPaymentPreview } from "@/lib/paymentPreview";
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
import { Loader2, CreditCard, Check, Smartphone, Copy } from "lucide-react";

const PAYMENT_METHODS = [
  { value: "upi", label: "UPI" },
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
];

// Cash is handled in person with no digital trail, so it deliberately gets
// no reference field or screenshot — nothing to attach. UPI/Bank Transfer
// get both, since those are the methods that actually produce a receipt.
const METHODS_WITH_PROOF = ["upi", "bank_transfer"];

export default function PayInstallmentDialog({
  open,
  onOpenChange,
  membership,
  plan,
  group,
  user,
  onPaid,
}) {
  const [method, setMethod] = useState("upi");
  const [reference, setReference] = useState("");
  const [screenshotPath, setScreenshotPath] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const { toast } = useToast();

  const [pendingNumbers, setPendingNumbers] = useState(new Set());
  // setSubmitting(true) only takes effect on the next render, so it can't
  // block a second click/tap that lands in the same tick (double-tap on
  // mobile, or a duplicate click/touchend some browsers still emit) --
  // this ref is checked-and-set synchronously as the very first thing in
  // handleSubmit, closing that gap. It's what actually stopped the same
  // installment being bulkCreate'd twice.
  const submitLockRef = useRef(false);

  useEffect(() => {
    if (!open) {
      setReference("");
      setScreenshotPath("");
      return;
    }
    if (!plan || !group?.id) {
      setPreview(null);
      return;
    }
    const loadAuctions = plan.model === "live_auction"
      ? base44.entities.Auction.filter({ group_id: group.id })
      : Promise.resolve([]);
    // A submitted payment doesn't advance paid_installments until an admin
    // approves it — without this, reopening the dialog before that review
    // happens shows the same installment as payable again, and the member
    // can submit a second payment for a month they've already paid for.
    const loadPending = membership?.id
      ? base44.entities.Payment.filter({ membership_id: membership.id, status: "pending" })
      : Promise.resolve([]);
    Promise.all([loadAuctions, loadPending])
      .then(([auctions, pendingRows]) => {
        const pendingNums = new Set(pendingRows.map((r) => r.installment_number));
        setPendingNumbers(pendingNums);
        setPreview(getNextPaymentPreview({ membership, plan, group, auctions, pendingNumbers: pendingNums }));
      })
      .catch(() => {
        setPendingNumbers(new Set());
        setPreview(null);
      });
  }, [open, plan, group, membership]);

  const currency = plan?.currency || "INR";

  // Every installment through the group's current month, oldest first —
  // this already includes the immediate "next" payment (it's the last
  // item), so there's no separate "pay just the next one" concept to track.
  // Excludes anything already awaiting admin review.
  const allItems = preview?.unpaidInstallments?.length
    ? preview.unpaidInstallments
    : [{ number: (membership?.paid_installments || 0) + 1, amount: plan?.monthly_contribution || 0, dueDate: null }];
  const items = allItems.filter((i) => !pendingNumbers.has(i.number));

  // Default every item to selected whenever the set of items changes (new
  // preview, pending-payment info, or dialog reopened).
  useEffect(() => {
    setSelected(new Set(items.map((i) => i.number)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, pendingNumbers, membership?.id]);

  if (!membership || !plan) return null;

  const toggle = (number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(number)) next.delete(number);
      else next.add(number);
      return next;
    });
  };

  // Fallback for when the upi:// deep link can't hand off to an external
  // app — most commonly because the member tapped a CashBox link from
  // inside WhatsApp/Instagram's own in-app browser, which frequently
  // swallows custom-scheme navigations instead of launching the UPI app.
  const copyUpiId = () => {
    navigator.clipboard?.writeText(BUSINESS_UPI_ID)
      .then(() => toast({ title: "UPI ID copied", description: "Paste it in your UPI app to pay." }))
      .catch(() => toast({ title: "Couldn't copy", description: BUSINESS_UPI_ID, variant: "destructive" }));
  };

  const installmentsToPay = items.filter((i) => selected.has(i.number));
  const amount = installmentsToPay.reduce((s, i) => s + i.amount, 0);
  const totalDue = items.reduce((s, i) => s + i.amount, 0);
  const remaining = totalDue - amount;

  const screenshotMissing = method === "upi" && !screenshotPath;

  const handleSubmit = async () => {
    if (!installmentsToPay.length || screenshotMissing || submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitting(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await base44.entities.Payment.bulkCreate(
        installmentsToPay.map((inst) => ({
          user_id: user?.id,
          membership_id: membership.id,
          member_profile_id: membership.member_profile_id,
          group_id: membership.group_id,
          installment_number: inst.number,
          amount: inst.amount,
          payment_date: today,
          method,
          currency,
          status: "pending",
          confirmation_number: method !== "cash" ? (reference || undefined) : undefined,
          etransfer_screenshot_url: METHODS_WITH_PROOF.includes(method) ? (screenshotPath || undefined) : undefined,
        }))
      );
      toast({
        title: installmentsToPay.length > 1 ? `${installmentsToPay.length} payments submitted!` : "Payment submitted!",
        description: "An admin will confirm receipt shortly.",
      });
      onOpenChange(false);
      setReference("");
      setScreenshotPath("");
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
            <CreditCard className="w-5 h-5 text-primary" /> Pay Installment
          </DialogTitle>
          <DialogDescription>
            {plan.plan_name} · {group?.group_name || group?.group_code || ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {items.length === 0 ? (
            <div className="bg-muted/30 rounded-xl p-4 text-sm text-muted-foreground text-center">
              {pendingNumbers.size > 0
                ? "Your payment has already been submitted and is awaiting admin confirmation."
                : "You're fully paid up — nothing due right now."}
            </div>
          ) : items.length > 1 ? (
            <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
              {items.map((item) => (
                <label
                  key={item.number}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(item.number)}
                    onChange={() => toggle(item.number)}
                    className="w-4 h-4 accent-[#ffb833] shrink-0"
                  />
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold grid place-items-center shrink-0">
                    {selected.has(item.number) ? <Check className="w-3.5 h-3.5" /> : item.number}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">Installment #{item.number}</p>
                    <p className="text-xs text-muted-foreground">{item.dueDate ? `Due ${item.dueDate}` : "—"}</p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums text-foreground shrink-0">
                    {formatMoney(item.amount, currency)}
                  </p>
                </label>
              ))}
              <div className="px-4 py-3 bg-muted/30 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">Total Amount</span>
                  <span className="text-xl font-bold text-primary tabular-nums">{formatMoney(amount, currency)}</span>
                </div>
                {remaining > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Remaining after this payment</span>
                    <span className="text-xs font-medium text-destructive tabular-nums">{formatMoney(remaining, currency)}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-muted/30 rounded-xl p-4 flex items-center justify-between">
              <div>
                <span className="text-sm text-muted-foreground block">Amount Due</span>
                <span className="text-xs text-muted-foreground">Installment #{items[0].number}</span>
              </div>
              <span className="text-2xl font-bold text-primary">
                {formatMoney(amount, currency)}
              </span>
            </div>
          )}

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

          {method === "upi" && amount > 0 && (
            <a
              href={buildUpiPaymentLink({
                amount,
                // Plain ASCII only — some UPI apps reject the deep link
                // outright if the transaction note has non-ASCII characters
                // (plan.plan_name has a rupee symbol and commas).
                note: `CashBox Installment ${installmentsToPay.map((i) => i.number).join(",")}`,
              })}
              className="flex items-center justify-center gap-2 w-full h-10 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              <Smartphone className="w-4 h-4" /> Pay {formatMoney(amount, currency)} via UPI App
            </a>
          )}

          {method === "upi" && (
            <div className="rounded-lg border border-border p-3 space-y-2">
              <p className="text-xs font-medium text-foreground">
                Button above not opening your UPI app?
              </p>
              <p className="text-xs text-muted-foreground">
                If you got here from a WhatsApp message, tap <span className="text-foreground font-medium">⋮ (top-right) → Open in browser</span>, then try the button again. Or pay manually:
              </p>
              <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                <li>Open your UPI app (PhonePe, Google Pay, Paytm, etc.)</li>
                <li>Choose "Pay to UPI ID" or "Send money" and enter the ID below</li>
                <li>Enter {formatMoney(amount, currency)} and complete the payment</li>
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
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-full"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !installmentsToPay.length || screenshotMissing}
            className="rounded-full bg-primary hover:bg-primary/90"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Submitting…
              </>
            ) : screenshotMissing ? (
              "Attach a screenshot to submit"
            ) : installmentsToPay.length > 1 ? (
              `Submit ${installmentsToPay.length} Payments`
            ) : (
              "Submit Payment"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
