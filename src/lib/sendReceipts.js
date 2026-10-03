import { base44 } from "@/api/base44Client";
import { generateInvoicePdf, generatePayoutReceiptPdf } from "@/lib/pdf";
import { sendWhatsAppMessage } from "@/lib/sendWhatsAppMessage";
import { formatMoney } from "@/lib/currency";

// Receipts go out over WhatsApp as the PDF itself, attached to the message
// (approved templates with a PDF header) -- never as a link.

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Could not read the PDF"));
    reader.readAsDataURL(blob);
  });
}

// Everything the installment receipt PDF needs, from a payment id.
export async function loadReceiptData(paymentId) {
  const payment = await base44.entities.Payment.get(paymentId);
  const [prof, grp, membership] = await Promise.all([
    payment.member_profile_id ? base44.entities.MemberProfile.get(payment.member_profile_id) : Promise.resolve(null),
    payment.group_id ? base44.entities.ChitGroup.get(payment.group_id) : Promise.resolve(null),
    // A member can hold more than one ticket in the same group, so the
    // specific ticket's chit number is needed on the receipt.
    payment.membership_id ? base44.entities.GroupMembership.get(payment.membership_id).catch(() => null) : Promise.resolve(null),
  ]);
  const plan = grp?.plan_id ? await base44.entities.ChitPlan.get(grp.plan_id) : null;
  const dividends = payment.group_id && payment.member_profile_id
    ? await base44.entities.Dividend.filter({ group_id: payment.group_id, member_profile_id: payment.member_profile_id, month_number: payment.installment_number }).catch(() => [])
    : [];
  return { payment, prof, grp, membership, plan, dividendAmount: dividends?.[0]?.amount || 0 };
}

// Sends one installment receipt as a PDF. Returns "pdf", or "link" when the PDF
// template isn't approved yet and the earlier link message was used instead.
export async function sendInstallmentReceipt({ payment, prof, grp, membership, plan, dividendAmount = 0, remainingBalance = null }) {
  if (!prof?.mobile) throw new Error("This member has no phone number on file.");
  const cur = payment.currency || plan?.currency || "INR";
  const memberName = prof.full_name || "Member";
  const installment = String(payment.installment_number || "-");
  const { blob, filename } = await generateInvoicePdf({ payment, member: prof, group: grp, membership, plan, dividendAmount, remainingBalance, returnFile: true });
  const base64 = await blobToBase64(blob);
  try {
    await sendWhatsAppMessage({
      phone: prof.mobile,
      templateName: "receipt_pdf_v1",
      parameters: [memberName, installment, formatMoney(payment.amount, cur)],
      document: { base64, filename },
      memberProfileId: prof.id,
      purpose: "receipt_pdf",
    });
    return "pdf";
  } catch (pdfErr) {
    // Only until Meta approves the PDF template: it is not usable yet, so use
    // the earlier link message rather than leave the receipt unsent. Any
    // other failure is reported as it is.
    if (!/template|132001|132000|does not exist|not approved/i.test(String(pdfErr.message || pdfErr))) throw pdfErr;
    await sendWhatsAppMessage({
      phone: prof.mobile,
      templateName: "receipt_ready_v3",
      parameters: [memberName, installment, formatMoney(payment.amount, cur), `${window.location.origin}/receipt/${payment.id}`],
    });
    return "link";
  }
}

// Same, starting from just a payment id (used where only the row is at hand).
export async function sendInstallmentReceiptById(paymentId, prof) {
  const data = await loadReceiptData(paymentId);
  return sendInstallmentReceipt({ ...data, prof: prof || data.prof });
}

// The prize payout receipt, sent when the admin marks a winner as paid.
export async function sendPayoutReceipt({ winner, prof, group, plan }) {
  if (!prof?.mobile) throw new Error("The winner has no phone number on file.");
  // The day the admin clicked Mark paid (stored on the winner), so a receipt that
  // is sent or resent later still carries the real payment date.
  const paidDate = new Date(winner.paid_at || Date.now()).toLocaleDateString("en-CA");
  const { blob, filename } = await generatePayoutReceiptPdf({ winner, member: prof, group, plan, paidDate, paidBy: "CashBox", returnFile: true });
  const base64 = await blobToBase64(blob);
  await sendWhatsAppMessage({
    phone: prof.mobile,
    templateName: "payout_receipt_pdf_v1",
    parameters: [prof.full_name || winner.member_name || "Member", String(winner.month_number), formatMoney(winner.prize_amount, plan?.currency || "INR")],
    document: { base64, filename },
    memberProfileId: prof.id,
    purpose: "payout_receipt_pdf",
  });
}
