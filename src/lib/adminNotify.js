// The business owner's own WhatsApp number — pinged whenever a member
// submits a payment, so noticing one came in doesn't depend on remembering
// to check the admin Payments page. No settings UI yet; change it here if
// it ever changes, same pattern as BUSINESS_UPI_ID/BUSINESS_INTERAC_EMAIL.
export const ADMIN_NOTIFY_PHONE = "+14163037369";

// Flip to true once "admin_payment_submitted_v1" clears Meta review — a
// template that isn't approved yet just fails the send every time, so
// this keeps that failure from being attempted at all in the meantime
// rather than hitting the API with a call known to be rejected.
export const ADMIN_PAYMENT_NOTIFY_APPROVED = false;
