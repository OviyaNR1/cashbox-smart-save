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
  // v4/v5 add a "Pay now: {{link}}" line — the originals had no tap-through
  // path to actually pay at all, on either the reminder or the overdue
  // templates. Still PENDING Meta review as of this fix.
  payment_reminder_overdue_v5: {
    body: "⏰ Hi *{{1}}*, your payment is {{2}} days overdue.\n{{3}}\nTotal due today: *{{4}}*\nPlease pay soon to avoid extra late fees.\nPay now: {{5}}\n*CashBox Team* 🏦",
    paramLabels: ["Name", "Days late", "Breakdown", "Total due", "Pay link"],
  },
  payment_reminder_urgent_v5: {
    body: "🚨 Hi *{{1}}*, urgent: your payment is {{2}} days overdue.\n{{3}}\nLate fee: {{4}}. Total due today: *{{5}}*.\nPlease pay immediately to restore your account.\nPay now: {{6}}\n*CashBox Team* 🏦",
    paramLabels: ["Name", "Days late", "Breakdown", "Late fee", "Total due", "Pay link"],
  },
  payment_upcoming_reminder_v4: {
    body: "Hi *{{1}}*, \n\nThis is a reminder about your upcoming CashBox Chit Fund installment:\n\nInstallment: #{{2}}\nAmount: *{{3}}*\nDue date: *{{4}}*\n\nPlease pay before the due date via UPI or Bank Transfer, and attach a screenshot as proof in the app.\n\nPay now: {{5}}\n\nCashBox Team 🏦",
    paramLabels: ["Name", "Installment #", "Amount", "Due date", "Pay link"],
  },
  payment_due_today_v2: {
    body: "⏰ Hi *{{1}}*, \n\nYour CashBox Chit Fund installment is due *today*!\n\nInstallment: #{{2}}\nAmount: *{{3}}*\nDue date: *{{4}}*\n\nPlease pay today via UPI or Bank Transfer, and attach a screenshot as proof in the app.\n\nPay now: {{5}}\n\nCashBox Team 🏦",
    paramLabels: ["Name", "Installment #", "Amount", "Due date", "Pay link"],
  },
  // Canada equivalents of the two above — same params, only the
  // payment-method line differs (Interac e-Transfer/Cash, not UPI/Bank
  // Transfer, which don't exist for Canada members).
  payment_upcoming_reminder_ca_v2: {
    body: "Hi *{{1}}*, \n\nThis is a reminder about your upcoming CashBox Chit Fund installment:\n\nInstallment: #{{2}}\nAmount: *{{3}}*\nDue date: *{{4}}*\n\nPlease pay before the due date via Interac e-Transfer or Cash, and attach a screenshot as proof in the app.\n\nPay now: {{5}}\n\nCashBox Team 🏦",
    paramLabels: ["Name", "Installment #", "Amount", "Due date", "Pay link"],
  },
  payment_due_today_ca_v2: {
    body: "⏰ Hi *{{1}}*, \n\nYour CashBox Chit Fund installment is due *today*!\n\nInstallment: #{{2}}\nAmount: *{{3}}*\nDue date: *{{4}}*\n\nPlease pay today via Interac e-Transfer or Cash, and attach a screenshot as proof in the app.\n\nPay now: {{5}}\n\nCashBox Team 🏦",
    paramLabels: ["Name", "Installment #", "Amount", "Due date", "Pay link"],
  },
  // v4 said "starts soon" — fine for a 2-hours-ahead heads-up, wrong once
  // reused as a flexible "announce whenever" reminder sent days in advance.
  auction_reminder_v5: {
    body: "🔨 Hi *{{1}}*, your next auction for *{{3}}* is on *{{2}}*.\nPlace your bid: {{4}}\n*CashBox Team* 🏦",
    paramLabels: ["Name", "Auction date/time", "Group", "Link"],
  },
  auction_starting_now_v1: {
    body: "🔨 Hi *{{1}}*, the *{{2}}* auction is *live right now*! Join and place your bid: {{3}}\n*CashBox Team* 🏦",
    paramLabels: ["Name", "Group", "Link"],
  },
  // v2 dropped v1's "Join Live Auction" URL button — that button made
  // WhatsApp prefetch and render a stray link-preview card above the actual
  // message (see sendReminders.js), since the button's target is just a
  // client-side route with no page-specific metadata to show instead.
  auction_save_the_date_v2: {
    body: "Hi {{1}},\n\nThis is a notice for your group {{3}}: a trial auction session is scheduled on {{2}} to help members practice bidding before the real auction. The official auction (with real funds) is scheduled for {{4}}.\n\n— CashBox Team 🏦",
    paramLabels: ["Name", "Trial auction date/time", "Group", "Real auction date/time"],
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
