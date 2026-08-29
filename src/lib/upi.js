// The business's UPI VPA for receiving member payments. No admin-settings
// UI exists yet for this — change it here (same pattern as
// ADMIN_NOTIFY_PHONE in PlanRequestCard.jsx), or ask for a settings field if
// you want it editable in the app itself.
export const BUSINESS_UPI_ID = "8344551836@ybl";
const BUSINESS_UPI_NAME = "CashBox";

// Builds a `upi://pay` deep link that opens the phone's UPI app chooser
// (Google Pay, PhonePe, etc.) with the payee and amount already filled in,
// so a member doesn't have to manually copy the UPI ID or type the amount.
// Only does anything on a device with a UPI app installed to handle the
// `upi://` scheme (mainly Android) — elsewhere the link is inert, so
// members there still rely on the reference number / screenshot fields.
//
// Known gap: in-app browsers (tapping a CashBox link from inside WhatsApp,
// Instagram, etc.) frequently block the handoff to an external app for a
// custom scheme like this — the WebView just fails to launch anything and
// drops the member back into the host app, which looks like "it opened
// WhatsApp instead of my UPI app". There's no reliable cross-app way to
// detect or work around this from inside the WebView; the copy-UPI-ID
// fallback next to this button in PayInstallmentDialog.jsx exists because
// of exactly this.
export function buildUpiPaymentLink({ amount, note }) {
  const params = new URLSearchParams({
    pa: BUSINESS_UPI_ID,
    pn: BUSINESS_UPI_NAME,
    am: Number(amount || 0).toFixed(2),
    cu: "INR",
  });
  if (note) params.set("tn", note);

  // On Android, wrap the same params as an intent:// URL instead of a bare
  // upi:// one. Chromium-based WebViews (including the Custom Tabs many
  // in-app browsers, WhatsApp's included, are built on) give intent:// URLs
  // special native handling that a plain custom scheme doesn't get, so this
  // sometimes still launches the UPI app chooser from inside WhatsApp where
  // upi:// alone gets silently swallowed. Not guaranteed — some in-app
  // browsers ignore intent:// too — but it's strictly an improvement over
  // the plain link, never worse. iOS has no equivalent, so it keeps upi://.
  if (typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent)) {
    return `intent://pay?${params.toString()}#Intent;scheme=upi;end`;
  }
  return `upi://pay?${params.toString()}`;
}
