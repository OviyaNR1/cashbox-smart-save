import { jsPDF } from "jspdf";
import QRCode from "qrcode";

// The PDF's built-in font has no rupee sign (it prints as a stray superscript
// 1), so text containing one is written with "INR" instead, and amounts are
// shown as "INR 70,500" / "CAD 5,000.00".
const pdfSafe = (t) => String(t ?? "-").replaceAll("\u20B9", "INR ");
const pdfMoney = (n, currency) => {
  const num = Number(n || 0);
  if (currency === "CAD") return `CAD ${num.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `INR ${num.toLocaleString("en-IN")}`;
};

export function buildInvoiceNumber({ group, payment }) {
  const groupCode = group?.group_code || "GRP";
  const installment = payment.installment_number || "0";
  const txnSuffix = (payment.transaction_id || payment.id).slice(-6).toUpperCase();
  return `INV-${groupCode}-${installment}-${txnSuffix}`;
}

/**
 * Generates and downloads a CashBox invoice/receipt PDF with an embedded
 * QR code linking back to the in-app receipt.
 */
// returnFile: hand back { blob, filename } (for attaching to a WhatsApp message)
// instead of downloading it in the browser.
export async function generateInvoicePdf({ payment, member, group, membership, plan, dividendAmount = 0, remainingBalance = null, returnFile = false }) {
  const cur = payment.currency || plan?.currency || "INR";
  const invoiceNumber = buildInvoiceNumber({ group, payment });
  const receiptUrl = `${window.location.origin}/receipt/${payment.id}`;
  const qrDataUrl = await QRCode.toDataURL(receiptUrl, { margin: 1, width: 160 });

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 48;
  let y = 56;

  // Header
  doc.setFillColor(255, 184, 51);
  doc.roundedRect(marginX, y - 20, 32, 32, 6, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(20, 20, 25);
  doc.text("CB", marginX + 7, y + 2);

  doc.setFontSize(18);
  doc.text("CashBox", marginX + 44, y - 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 120);
  doc.text("Digital Chit Management", marginX + 44, y + 10);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(20, 20, 25);
  doc.text("INVOICE", pageWidth - marginX, y - 10, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 120);
  doc.text(invoiceNumber, pageWidth - marginX, y + 4, { align: "right" });

  y += 40;
  doc.setDrawColor(225, 225, 230);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 28;

  const field = (label, value, x) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 150);
    doc.text(label.toUpperCase(), x, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(20, 20, 25);
    doc.text(pdfSafe(value ?? "—"), x, y + 15);
  };

  const col1 = marginX;
  const col2 = marginX + (pageWidth - 2 * marginX) / 2;

  field("Member", member?.full_name, col1);
  field("Member code", member?.member_code, col2);
  y += 40;
  field("Group", group?.group_name || group?.group_code, col1);
  field("Plan", plan?.plan_name, col2);
  y += 40;
  field("Chit number", membership?.chit_number ? `#${membership.chit_number}` : null, col1);
  field("Installment #", payment.installment_number, col2);
  y += 40;
  field("Payment date", payment.payment_date, col1);
  field("Method", (payment.method || "").replace("_", " "), col2);
  y += 48;

  doc.setDrawColor(225, 225, 230);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 24;

  const amountRow = (label, value, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 12 : 10);
    doc.setTextColor(bold ? 20 : 90, bold ? 20 : 90, bold ? 25 : 100);
    doc.text(label, col1, y);
    doc.text(pdfMoney(value, cur), pageWidth - marginX, y, { align: "right" });
    y += 22;
  };

  amountRow("Installment amount", payment.amount);
  if (payment.late_fee > 0) amountRow("Late fee", payment.late_fee);
  amountRow("Dividend credited", dividendAmount);
  doc.setDrawColor(225, 225, 230);
  doc.line(marginX, y - 6, pageWidth - marginX, y - 6);
  y += 4;
  amountRow("Total paid", (payment.amount || 0) + (payment.late_fee || 0), true);
  if (remainingBalance !== null) amountRow("Remaining balance", remainingBalance);

  // QR code
  const qrSize = 96;
  doc.addImage(qrDataUrl, "PNG", pageWidth - marginX - qrSize, y + 16, qrSize, qrSize);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(140, 140, 150);
  doc.text("Scan to view receipt online", pageWidth - marginX - qrSize / 2, y + 16 + qrSize + 12, { align: "center" });

  doc.setFontSize(8);
  doc.text(
    `This is a system-generated receipt. Collected by ${payment.collected_by || "CashBox admin"}.`,
    marginX,
    y + 16 + qrSize + 12
  );

  if (returnFile) return { blob: doc.output("blob"), filename: `${invoiceNumber}.pdf` };
  doc.save(`${invoiceNumber}.pdf`);
  return null;
}

export function buildPayoutNumber({ group, winner }) {
  return `PAY-${group?.group_code || "GRP"}-M${winner.month_number}-${String(winner.id).slice(-6).toUpperCase()}`;
}

/**
 * Prize payout receipt for a chit winner — given to the winner once the admin
 * marks the prize as paid. Same look as the installment receipt.
 * returnFile: hand back { blob, filename } instead of downloading it.
 */
export async function generatePayoutReceiptPdf({ winner, member, group, plan, paidDate, paidBy, returnFile = false }) {
  const cur = plan?.currency || "INR";
  const number = buildPayoutNumber({ group, winner });
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 48;
  let y = 56;

  doc.setFillColor(255, 184, 51);
  doc.roundedRect(marginX, y - 20, 32, 32, 6, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(20, 20, 25);
  doc.text("CB", marginX + 7, y + 2);
  doc.setFontSize(18);
  doc.text("CashBox", marginX + 44, y - 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 120);
  doc.text("Digital Chit Management", marginX + 44, y + 10);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(20, 20, 25);
  doc.text("PRIZE PAYOUT RECEIPT", pageWidth - marginX, y - 10, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 120);
  doc.text(number, pageWidth - marginX, y + 4, { align: "right" });

  y += 40;
  doc.setDrawColor(225, 225, 230);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 28;

  const field = (label, value, x) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(130, 130, 140);
    doc.text(label.toUpperCase(), x, y);
    doc.setFontSize(11);
    doc.setTextColor(20, 20, 25);
    doc.text(pdfSafe(value), x, y + 15);
  };
  const colB = marginX + (pageWidth - marginX * 2) / 2;
  field("Winner", member?.full_name || winner.member_name, marginX);
  field("Member code", member?.member_code || "-", colB);
  y += 44;
  field("Group", group?.group_name || group?.group_code, marginX);
  field("Plan", plan?.plan_name, colB);
  y += 44;
  field("Month won", `Month ${winner.month_number}`, marginX);
  field("Announced on", winner.announcement_date, colB);
  y += 44;
  field("Paid on", paidDate, marginX);
  field("Paid by", paidBy || "CashBox admin", colB);
  y += 52;

  doc.line(marginX, y, pageWidth - marginX, y);
  y += 30;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(20, 20, 25);
  doc.text("Prize amount paid", marginX, y);
  doc.text(pdfMoney(winner.prize_amount, cur), pageWidth - marginX, y, { align: "right" });
  y += 36;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 120);
  doc.text("This is a system-generated receipt confirming the prize payout for the month above.", marginX, y);

  const filename = `${number}.pdf`;
  if (returnFile) return { blob: doc.output("blob"), filename };
  doc.save(filename);
  return null;
}
