// The business's Interac e-Transfer recipient email for Canada member
// payments. No admin-settings UI exists yet for this — change it here (same
// pattern as BUSINESS_UPI_ID in upi.js), or ask for a settings field if you
// want it editable in the app itself.
export const BUSINESS_INTERAC_EMAIL = "sathya.jovial222@gmail.com";

// Autodeposit is enabled on this email, so a transfer lands automatically
// with no security question/answer step — members only ever need the email
// itself. If Autodeposit is ever turned off, a security question/answer
// pair would need to be surfaced here and in PayInstallmentDialog.jsx /
// PayAllDialog.jsx's Interac instructions.
export const INTERAC_AUTODEPOSIT_ENABLED = true;
