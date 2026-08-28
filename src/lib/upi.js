// The business's UPI VPA for receiving member payments. No admin-settings
// UI exists yet for this — change it here (same pattern as
// ADMIN_NOTIFY_PHONE in PlanRequestCard.jsx), or ask for a settings field if
// you want it editable in the app itself.
const BUSINESS_UPI_ID = "8344551836@ybl";
const BUSINESS_UPI_NAME = "CashBox";

// Builds a `upi://pay` deep link that opens the phone's UPI app chooser
// (Google Pay, PhonePe, etc.) with the payee and amount already filled in,
// so a member doesn't have to manually copy the UPI ID or type the amount.
// Only does anything on a device with a UPI app installed to handle the
// `upi://` scheme (mainly Android) — elsewhere the link is inert, so
// members there still rely on the reference number / screenshot fields.
export function buildUpiPaymentLink({ amount, note }) {
  const params = new URLSearchParams({
    pa: BUSINESS_UPI_ID,
    pn: BUSINESS_UPI_NAME,
    am: Number(amount || 0).toFixed(2),
    cu: "INR",
  });
  if (note) params.set("tn", note);
  return `upi://pay?${params.toString()}`;
}
