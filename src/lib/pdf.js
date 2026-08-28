import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { formatMoney } from "@/lib/currency";

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
export async function generateInvoicePdf({ payment, member, group, plan, dividendAmount = 0, remainingBalance = null }) {
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
    doc.text(String(value ?? "—"), x, y + 15);
  };

  const col1 = marginX;
  const col2 = marginX + (pageWidth - 2 * marginX) / 2;

  field("Member", member?.full_name, col1);
  field("Member code", member?.member_code, col2);
  y += 40;
  field("Group", group?.group_code, col1);
  field("Plan", plan?.plan_name, col2);
  y += 40;
  field("Installment #", payment.installment_number, col1);
  field("Payment date", payment.payment_date, col2);
  y += 40;
  field("Month", plan ? `${payment.installment_number || "—"} of ${plan.duration_months}` : "—", col1);
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
    doc.text(formatMoney(value, cur), pageWidth - marginX, y, { align: "right" });
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

  doc.save(`${invoiceNumber}.pdf`);
}
