import { base44 } from "@/api/base44Client";
import { collectionDateUTC, todayUTC } from "./dates";
import { sendWhatsAppMessage } from "./sendWhatsAppMessage";
import { logAudit } from "./audit";

// Every "compute" function below only reads data and returns who WOULD get
// a reminder and exactly what it would say — no message is sent. The admin
// reviews this list, then the matching "send" function is called with that
// exact list (not recomputed) so what actually goes out always matches what
// was shown, even if the underlying data changes in between.

export const computePaymentReminderTargets = async (groupId) => {
  const group = await base44.entities.ChitGroup.get(groupId);
  if (!group) throw new Error("Group not found");

  // Monthly amount and currency live on the plan, not the group
  const plan = await base44.entities.ChitPlan.get(group.plan_id);

  const memberships = await base44.entities.GroupMembership.filter({
    group_id: groupId,
    status: "active",
  });
  if (memberships.length === 0) return [];

  // Get every successful payment ever made in this group, so we can tell
  // which installments (not just the current one) each member has settled.
  const allPayments = await base44.entities.Payment.filter({
    group_id: groupId,
    status: "success",
  });

  const currency = plan?.currency || "INR";
  const monthlyAmount = plan?.monthly_contribution || 0;
  const today = todayUTC(currency);

  const targets = [];

  for (const membership of memberships) {
    const paidInstallments = new Set(
      allPayments
        .filter((p) => p.member_profile_id === membership.member_profile_id)
        .map((p) => p.installment_number)
    );

    // Every installment from 1 through the group's current month that this
    // member hasn't paid — a member stuck for several months accrues all
    // of them, not just the latest one.
    const unpaidInstallments = [];
    for (let i = 1; i <= group.current_month; i++) {
      if (!paidInstallments.has(i)) unpaidInstallments.push(i);
    }
    if (unpaidInstallments.length === 0) continue;

    const oldestUnpaid = Math.min(...unpaidInstallments);
    // Installment N is due N-1 months after start_date (installment 1 is
    // due in the start month itself) — same convention as
    // auctionEngine.js/paymentPreview.js. Passing the installment number
    // directly here (no -1) made every due date compute a full month late.
    const collDate = new Date(collectionDateUTC(group.start_date, oldestUnpaid - 1, group.monthly_collection_date));
    const daysLate = Math.floor((today - collDate) / (1000 * 60 * 60 * 24));
    if (daysLate <= 0) continue; // oldest unpaid installment isn't due yet

    const profile = await base44.entities.MemberProfile.get(membership.member_profile_id);
    if (!profile?.mobile) continue;

    const outstandingAmount = unpaidInstallments.length * monthlyAmount;
    const amountStr = `${currency} ${outstandingAmount}`;
    const daysLateStr = daysLate.toString();
    const breakdown = unpaidInstallments
      .map((n) => `Month ${n} overdue = ${currency} ${monthlyAmount}`)
      .join("\n");
    const template = daysLate <= 7 ? "payment_reminder_overdue_v4" : "payment_reminder_urgent_v4";

    // late_interest_percent is the plan's own configured monthly rate (e.g.
    // 2%) — prorated by how many days late against the actual outstanding
    // amount, same as a simple monthly interest calculation. A plan with no
    // rate configured (0, e.g. live_auction/lakhbox) correctly charges no
    // late fee rather than a fabricated one.
    const lateFee = Math.round(outstandingAmount * ((plan?.late_interest_percent || 0) / 100) * (daysLate / 30));

    const parameters = template === "payment_reminder_urgent_v4"
      ? [profile.full_name, daysLateStr, breakdown, `${currency} ${lateFee}`, amountStr]
      : [profile.full_name, daysLateStr, breakdown, amountStr];

    targets.push({
      memberProfileId: profile.id,
      fullName: profile.full_name || "Member",
      mobile: profile.mobile,
      daysLate,
      outstandingAmount,
      amountStr,
      lateFee,
      template,
      parameters,
    });
  }

  return targets;
};

export const sendPaymentReminders = async (groupId, targets) => {
  const list = targets || (await computePaymentReminderTargets(groupId));
  let sent = 0;
  let failed = 0;

  for (const t of list) {
    try {
      await sendWhatsAppMessage({ phone: t.mobile, templateName: t.template, parameters: t.parameters });
      sent++;
    } catch (err) {
      console.error(`Failed to send reminder to ${t.fullName}:`, err);
      failed++;
    }
  }

  logAudit({
    module: "Reminders",
    action: "send-payment-reminders",
    record_id: groupId,
    details: `Sent ${sent} payment reminder${sent === 1 ? "" : "s"}${failed ? ` (${failed} failed)` : ""} — ${list.map((t) => `${t.fullName} (${t.daysLate}d late, ${t.amountStr})`).join("; ") || "none"}`,
  });

  return { sent, failed };
};

export const computeAuctionReminderTargets = async (groupId) => {
  const group = await base44.entities.ChitGroup.get(groupId);
  if (!group) throw new Error("Group not found");

  const plan = await base44.entities.ChitPlan.get(group.plan_id);
  if (!plan || plan.model !== "live_auction") throw new Error("Not a live auction group");

  const memberships = await base44.entities.GroupMembership.filter({
    group_id: groupId,
    status: "active",
  });
  if (memberships.length === 0) return { targets: [], auctionDateStr: null };

  // Get the group's current (not-yet-closed) auction. "pending" was never a
  // real status — the auctions table only allows scheduled/open/call_1/
  // call_2/final_call/closed/cancelled, so filtering on status: "pending"
  // could never match a row and this silently sent 0 reminders forever.
  const groupAuctions = await base44.entities.Auction.filter({ group_id: groupId }, "-month_number", 5);
  const upcomingAuction = groupAuctions.find((a) => a.status !== "closed" && a.status !== "cancelled");
  if (!upcomingAuction) return { targets: [], auctionDateStr: null };

  const memberProfiles = await Promise.all(
    memberships.map((m) => base44.entities.MemberProfile.get(m.member_profile_id))
  );

  const auctionDate = new Date(upcomingAuction.created_at);
  const auctionDateStr = auctionDate.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  const targets = memberProfiles
    .filter((p) => p?.mobile)
    .map((p) => ({
      memberProfileId: p.id,
      fullName: p.full_name || "Member",
      mobile: p.mobile,
      template: "auction_reminder_v4",
      parameters: [p.full_name, auctionDateStr, group.group_name || group.group_code, `${window.location.origin}/live-auction`],
    }));

  return { targets, auctionDateStr };
};

export const sendAuctionReminders = async (groupId, targets) => {
  const list = targets || (await computeAuctionReminderTargets(groupId)).targets;
  let sent = 0;
  let failed = 0;

  for (const t of list) {
    try {
      await sendWhatsAppMessage({ phone: t.mobile, templateName: t.template, parameters: t.parameters });
      sent++;
    } catch (err) {
      console.error(`Failed to send auction reminder to ${t.fullName}:`, err);
      failed++;
    }
  }

  logAudit({
    module: "Reminders",
    action: "send-auction-reminders",
    record_id: groupId,
    details: `Sent ${sent} auction reminder${sent === 1 ? "" : "s"}${failed ? ` (${failed} failed)` : ""} — ${list.map((t) => t.fullName).join(", ") || "none"}`,
  });

  return { sent, failed };
};

// The "1 day before it's due" nudge — distinct from computePaymentReminderTargets,
// which only ever fires AFTER the due date has already passed. This fires the
// day before, for anyone who hasn't paid yet, regardless of how many days
// remain until the group's overall current-month cycle.
export const computeUpcomingDueTargets = async (groupId, daysBefore = 1) => {
  const group = await base44.entities.ChitGroup.get(groupId);
  if (!group) throw new Error("Group not found");
  const plan = await base44.entities.ChitPlan.get(group.plan_id);

  const memberships = await base44.entities.GroupMembership.filter({
    group_id: groupId,
    status: "active",
  });
  if (memberships.length === 0) return [];

  const allPayments = await base44.entities.Payment.filter({
    group_id: groupId,
    status: "success",
  });

  const currency = plan?.currency || "INR";
  const monthlyAmount = plan?.monthly_contribution || 0;
  // current_month is 1-indexed ("Month 1" is due in the start month itself),
  // same convention as auctionEngine.js/paymentPreview.js.
  const dueDate = new Date(collectionDateUTC(group.start_date, group.current_month - 1, group.monthly_collection_date));
  const today = todayUTC(currency);
  // Both sides are UTC-midnight now, so this is always a clean whole number
  // of days — no fractional-day drift from comparing against the real
  // current instant, which previously made this silently miss its target
  // day (and so send nothing) depending on what time it was when it ran.
  const daysUntilDue = Math.round((dueDate - today) / (1000 * 60 * 60 * 24));
  if (daysUntilDue !== daysBefore) return [];

  const dueDateStr = dueDate.toLocaleDateString("en-IN", { day: "numeric", month: "long" });
  const targets = [];

  for (const membership of memberships) {
    const alreadyPaid = allPayments.some(
      (p) => p.member_profile_id === membership.member_profile_id && p.installment_number === group.current_month
    );
    if (alreadyPaid) continue;

    const profile = await base44.entities.MemberProfile.get(membership.member_profile_id);
    if (!profile?.mobile) continue;

    const amountStr = `${currency} ${monthlyAmount}`;
    targets.push({
      memberProfileId: profile.id,
      fullName: profile.full_name || "Member",
      mobile: profile.mobile,
      dueDateStr,
      amountStr,
      template: "payment_upcoming_reminder_v3",
      parameters: [profile.full_name, String(group.current_month), amountStr, dueDateStr],
    });
  }

  return targets;
};

export const sendUpcomingDueReminders = async (groupId, targets, daysBefore = 1) => {
  const list = targets || (await computeUpcomingDueTargets(groupId, daysBefore));
  let sent = 0;
  let failed = 0;

  for (const t of list) {
    try {
      await sendWhatsAppMessage({ phone: t.mobile, templateName: t.template, parameters: t.parameters });
      sent++;
    } catch (err) {
      console.error(`Failed to send upcoming-due reminder to ${t.fullName}:`, err);
      failed++;
    }
  }

  logAudit({
    module: "Reminders",
    action: "send-upcoming-due-reminders",
    record_id: groupId,
    details: `Sent ${sent} upcoming-due reminder${sent === 1 ? "" : "s"}${failed ? ` (${failed} failed)` : ""} — ${list.map((t) => t.fullName).join(", ") || "none"}`,
  });

  return { sent, failed };
};
