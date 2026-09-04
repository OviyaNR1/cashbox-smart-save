// Local mirror of each approved WhatsApp template's exact body text, so the
// Reminders page can render a live "what will this actually say" preview
// before sending. WhatsApp templates can't be edited freely at send time —
// only the {{n}} variable values are dynamic — so this deliberately can't
// drift from what's live in Meta by more than a copy-paste; if a template
// body changes in Meta, update the matching entry here too.
//
// Each entry: `body` (with {{n}} placeholders, matching WhatsApp's own
// *bold*/_italic_ markdown) and `paramLabels` (what each parameter means,
// in order, for the edit form).
export const TEMPLATE_PREVIEWS = {
  payment_reminder_overdue_v4: {
    body: "⏰ Hi *{{1}}*, your payment is {{2}} days overdue.\n{{3}}\nTotal due today: *{{4}}*\nPlease pay soon to avoid extra late fees.\n*CashBox Team* 🏦",
    paramLabels: ["Name", "Days late", "Breakdown", "Total due"],
  },
  payment_reminder_urgent_v4: {
    body: "🚨 Hi *{{1}}*, urgent: your payment is {{2}} days overdue.\n{{3}}\nLate fee: {{4}}. Total due today: *{{5}}*.\nPlease pay immediately to restore your account.\n*CashBox Team* 🏦",
    paramLabels: ["Name", "Days late", "Breakdown", "Late fee", "Total due"],
  },
  payment_upcoming_reminder_v3: {
    body: "Hi *{{1}}*, \n\nThis is a reminder about your upcoming CashBox Chit Fund installment:\n\nInstallment: #{{2}}\nAmount: *{{3}}*\nDue date: {{4}}\n\nPlease pay before the due date via UPI or Bank Transfer, and attach a screenshot as proof in the app.\n\nCashBox Team 🏦",
    paramLabels: ["Name", "Installment #", "Amount", "Due date"],
  },
  auction_reminder_v4: {
    body: "🔨 Hi *{{1}}*, the {{2}} auction for *{{3}}* starts soon.\nPlace your bid: {{4}}\n*CashBox Team* 🏦",
    paramLabels: ["Name", "Auction date/time", "Group", "Link"],
  },
};

// Substitutes {{1}}, {{2}}, ... with the given parameter values.
export function renderTemplateBody(templateName, parameters) {
  const entry = TEMPLATE_PREVIEWS[templateName];
  if (!entry) return null;
  let text = entry.body;
  (parameters || []).forEach((value, i) => {
    text = text.replaceAll(`{{${i + 1}}}`, value ?? "");
  });
  return text;
}

export function paramLabelsFor(templateName) {
  return TEMPLATE_PREVIEWS[templateName]?.paramLabels || [];
}
