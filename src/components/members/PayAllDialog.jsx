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
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { formatMoney } from "@/lib/currency";
import FileUpload from "@/components/members/FileUpload";
import { buildUpiPaymentLink, BUSINESS_UPI_ID, BUSINESS_UPI_NUMBER } from "@/lib/upi";
import { BUSINESS_INTERAC_EMAIL } from "@/lib/interac";
import { Loader2, CreditCard, Smartphone, Copy } from "lucide-react";
import QRCode from "qrcode";

// India members pay by UPI, Canada members by Interac e-Transfer — there's
// no cross-border equivalent of either, so the option list itself switches
// on the plan's currency rather than offering both everywhere. Cross-country
// membership isn't possible (assignment is blocked in
// MemberGroupAssignment.jsx), so a member's cart here is always one
// currency in practice; INR is the fallback for the brief window before
// `items` loads and singleCurrency is still null.
// "e_transfer" (not "interac") because that's the value the payments
// table's method check constraint actually allows — "interac" is never a
// valid value and silently failed every submission until this was caught.
const PAYMENT_METHODS_BY_CURRENCY = {
  INR: [{ value: "upi", label: "UPI" }, { value: "cash", label: "Cash" }],
  CAD: [{ value: "e_transfer", label: "Interac e-Transfer" }, { value: "cash", label: "Cash" }],
};
const METHODS_WITH_PROOF = ["upi", "bank_transfer", "e_transfer"];

// Tapping the UPI deep link hands off to another app for however long the
// member takes to pay and screenshot the confirmation — mobile browsers
// frequently reclaim/reload a backgrounded tab during that gap, which wipes
// all in-memory React state (including this dialog being open at all).
// Saving a tiny draft right before navigating and restoring it on the next
// mount makes the round trip survive a reload. Keyed globally (not per
// membership) since this dialog already spans every membership a member
// has; a member only has one of these carts in flight at a time.
const DRAFT_KEY = "cashbox_payall_draft_v1";
const DRAFT_MAX_AGE_MS = 30 * 60 * 1000;

function saveDraft({ method, selectedKeys }) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ method, selectedKeys, ts: Date.now() }));
  } catch { /* storage unavailable — degrades to today's behavior */ }
}

function readDraft() {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (Date.now() - (draft.ts || 0) > DRAFT_MAX_AGE_MS) return null;
    return draft;
  } catch {
    return null;
  }
}

function clearDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* nothing to clear */ }
}

// Cart-style checkout across every unpaid installment a member has, across
// all of their tickets and groups at once — the "select what you want to
// pay, see one total, submit once" flow used everywhere a member can pay
// (Dashboard, Payments, My Chits), so a member with several tickets never
// has to submit a separate screenshot per ticket.
// `preselectMembershipId` lets a "Pay" button on one specific ticket (e.g.
// My Chits' per-ticket card) open this same combined dialog defaulting to
// just that ticket's items checked — not every ticket the member holds —
// while every other unpaid ticket is still right there, one tap away from
// being added to the same submission. That's the whole point of routing
// every pay entry point through this one dialog instead of each screen
// keeping its own single-ticket version: the member always sees the same
// screen, and combining two tickets into one screenshot is always just
// checking a second box, never a separate flow.
export default function PayAllDialog({ open, onOpenChange, items, user, onPaid, preselectMembershipId }) {
  const [method, setMethod] = useState("upi");
  const [screenshotPath, setScreenshotPath] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const { toast } = useToast();
  // setSubmitting(true) only takes effect on the next render, so it can't
  // block a second click/tap that lands in the same tick (double-tap on
  // mobile, or a duplicate click/touchend some browsers still emit) — this
  // ref is checked-and-set synchronously as the very first thing in
  // handleSubmit, closing that gap.
  const submitLockRef = useRef(false);
  const draftRestoredRef = useRef(false);
  const [qrDataUrl, setQrDataUrl] = useState("");

  // Defaults to every item selected — unless a specific ticket was the
  // reason this dialog opened (preselectMembershipId), in which case only
  // that ticket's own items start checked. Skipped when a saved draft is
  // about to restore a specific selection instead (see below).
  useEffect(() => {
    if (!open) {
      setScreenshotPath("");
      return;
    }
    if (readDraft()) return;
    const keys = preselectMembershipId
      ? (items || []).filter((i) => i.membership.id === preselectMembershipId).map((i) => i.key)
      : (items || []).map((i) => i.key);
    setSelected(new Set(keys));
  }, [open, items, preselectMembershipId]);

  const allItems = items || [];
  const chosen = allItems.filter((i) => selected.has(i.key));

  // Runs once real items are available. Restores the in-progress
  // method/reference/selection and reopens the dialog after a round trip
  // to the UPI app reloaded the page (see DRAFT_KEY comment above).
  useEffect(() => {
    if (draftRestoredRef.current || !allItems.length) return;
    const draft = readDraft();
    if (!draft) return;
    draftRestoredRef.current = true;
    const validKeys = new Set(allItems.map((i) => i.key));
    const restoredSelection = (draft.selectedKeys || []).filter((k) => validKeys.has(k));
    setSelected(new Set(restoredSelection.length ? restoredSelection : allItems.map((i) => i.key)));
    if (draft.method) setMethod(draft.method);
    onOpenChange(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allItems.length]);

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
  const paymentMethods = PAYMENT_METHODS_BY_CURRENCY[singleCurrency] || PAYMENT_METHODS_BY_CURRENCY.INR;

  // Reconciles the method once real items (and therefore singleCurrency)
  // load — the initial "upi" default is only a guess made before any items
  // exist yet.
  useEffect(() => {
    if (!paymentMethods.some((m) => m.value === method)) {
      setMethod(paymentMethods[0].value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [singleCurrency]);

  const toggle = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const copyUpiId = () => {
    saveDraft({ method, selectedKeys: [...selected] });
    navigator.clipboard?.writeText(BUSINESS_UPI_ID)
      .then(() => toast({ title: "UPI ID copied", description: "Paste it in your UPI app to pay." }))
      .catch(() => toast({ title: "Couldn't copy", description: BUSINESS_UPI_ID, variant: "destructive" }));
  };

  const copyUpiNumber = () => {
    saveDraft({ method, selectedKeys: [...selected] });
    navigator.clipboard?.writeText(BUSINESS_UPI_NUMBER)
      .then(() => toast({ title: "UPI Number copied", description: "Paste it in your UPI app to pay." }))
      .catch(() => toast({ title: "Couldn't copy", description: BUSINESS_UPI_NUMBER, variant: "destructive" }));
  };

  const copyInteracEmail = () => {
    saveDraft({ method, selectedKeys: [...selected] });
    navigator.clipboard?.writeText(BUSINESS_INTERAC_EMAIL)
      .then(() => toast({ title: "Email copied", description: "Paste it as the recipient in your bank's e-Transfer screen." }))
      .catch(() => toast({ title: "Couldn't copy", description: BUSINESS_INTERAC_EMAIL, variant: "destructive" }));
  };

  // Scanning a QR code sidesteps both of the reliability issues the deep
  // link and manual copy-paste have: it doesn't depend on the browser
  // handing off to an app (the in-app-browser problem), and it doesn't go
  // through a UPI app's own "search by ID" resolution.
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
          etransfer_screenshot_url: METHODS_WITH_PROOF.includes(method) ? (screenshotPath || undefined) : undefined,
        }))
      );
      toast({
        title: chosen.length > 1 ? `${chosen.length} payments submitted!` : "Payment submitted!",
        description: "An admin will confirm receipt shortly.",
      });
      clearDraft();
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
                    {paymentMethods.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {method === "upi" && (
                <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                  Viewing this from a WhatsApp message? Tap <span className="font-semibold">⋮ (top-right) → Open in browser</span> first — WhatsApp's built-in browser blocks the button below from opening your UPI app.
                </p>
              )}

              {method === "e_transfer" && (
                <div className="rounded-lg border border-border p-3 space-y-2">
                  <p className="text-xs font-medium text-foreground">
                    Send an Interac e-Transfer for {totalDisplay} to:
                  </p>
                  <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-2">
                    <code className="flex-1 min-w-0 text-xs font-medium text-foreground truncate select-all">{BUSINESS_INTERAC_EMAIL}</code>
                    <button
                      type="button"
                      onClick={copyInteracEmail}
                      className="shrink-0 inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-border text-xs font-medium text-foreground hover:bg-muted"
                    >
                      <Copy className="w-3 h-3" /> Copy
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Autodeposit is enabled on this email — no security question needed, the transfer completes automatically.
                  </p>
                </div>
              )}

              {method === "upi" && chosen.length > 0 && singleCurrency === "INR" && (
                <a
                  href={buildUpiPaymentLink({
                    amount: totalsByCurrency.INR,
                    note: `CashBox Installments x${chosen.length}`,
                  })}
                  onClick={() => saveDraft({ method, selectedKeys: [...selected] })}
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
                    Still stuck? Pay manually instead:
                  </p>
                  <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                    <li>Open your UPI app (PhonePe, Google Pay, Paytm, etc.)</li>
                    <li>Choose "Pay to UPI ID" (or "Pay to mobile number") and enter one of the two below</li>
                    <li>Enter {totalDisplay} and complete the payment</li>
                  </ol>
                  {/* The copy button alone isn't enough — clipboard access can
                      silently fail (older browsers, missing permission, no
                      HTTPS), and even when it works, a member can't visually
                      verify or manually type an ID they never actually saw. Two
                      options since not every UPI app resolves the newer UPI
                      Number format yet — the VPA below is the universal one. */}
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
                  <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-2">
                    <div className="flex-1 min-w-0">
                      <code className="text-xs font-medium text-foreground truncate select-all block">{BUSINESS_UPI_NUMBER}</code>
                      <p className="text-[10px] text-muted-foreground">UPI Number (alternative)</p>
                    </div>
                    <button
                      type="button"
                      onClick={copyUpiNumber}
                      className="shrink-0 inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-border text-xs font-medium text-foreground hover:bg-muted"
                    >
                      <Copy className="w-3 h-3" /> Copy
                    </button>
                  </div>
                </div>
              )}

              {method !== "cash" && (
                <>
                  <FileUpload
                    label={method === "upi" ? "Payment screenshot (required)" : "Payment screenshot (optional)"}
                    value={screenshotPath}
                    onChange={setScreenshotPath}
                    bucket="payment-proofs"
                  />
                </>
              )}
            </>
          )}
        </div>

        {screenshotMissing && (
          <p className="text-xs text-amber-400 text-center animate-pulse motion-reduce:animate-none">
            Attach a payment screenshot above to enable Submit.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => { clearDraft(); onOpenChange(false); }} className="rounded-full">
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
