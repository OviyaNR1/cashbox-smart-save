import React, { useState, useEffect } from "react";
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
import { Loader2, CreditCard, Check } from "lucide-react";

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

  const installmentsToPay = items.filter((i) => selected.has(i.number));
  const amount = installmentsToPay.reduce((s, i) => s + i.amount, 0);
  const totalDue = items.reduce((s, i) => s + i.amount, 0);
  const remaining = totalDue - amount;

  const handleSubmit = async () => {
    if (!installmentsToPay.length) return;
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
            {plan.plan_name} · {group?.group_code || ""}
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
                label="Payment screenshot (optional)"
                value={screenshotPath}
                onChange={setScreenshotPath}
                bucket="payment-proofs"
              />
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
            disabled={submitting || !installmentsToPay.length}
            className="rounded-full bg-primary hover:bg-primary/90"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Submitting…
              </>
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
