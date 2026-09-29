import { base44 } from "@/api/base44Client";
import { collectionDateUTC, todayUTC } from "./dates";
import { sendWhatsAppMessage } from "./sendWhatsAppMessage";
import { logAudit } from "./audit";
import { getNextPaymentPreview } from "./paymentPreview";

// Every unpaid installment shown in a reminder must price at what the
// member actually owes right now, not the plan's flat monthly_contribution
// — for a live_auction plan, a closed auction applies a per-member dividend
// that lowers the real amount below the base rate (see paymentPreview.js /
// liveAuctionEngine.js), and that discount can only be known by asking the
// same shared preview function everything else in the app already relies
// on. A real send once told members ₹5,000 when the correct dividend-
// adjusted price was ₹3,850 — this is exactly the bug that caused it.
// Fetched once per group (not per membership) — every membership in the
// same group shares the same auction history.
async function auctionsFor(plan, groupId) {
  return plan?.model === "live_auction"
    ? await base44.entities.Auction.filter({ group_id: groupId })
    : [];
}

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

  const auctions = await auctionsFor(plan, groupId);
  const currency = plan?.currency || "INR";
  const today = todayUTC(currency);

  const targets = [];

  for (const membership of memberships) {
    // Correctly priced per installment (dividend-adjusted for live_auction,
    // formula-based for chit_fund, flat for lakhbox) — not a flat
    // monthly_contribution multiplied by count. Oldest-first, same as before.
    const unpaidInstallments = getNextPaymentPreview({ membership, plan, group, auctions }).unpaidInstallments;
    if (unpaidInstallments.length === 0) continue;

    const oldest = unpaidInstallments[0];
    const daysLate = Math.floor((today - new Date(oldest.dueDate)) / (1000 * 60 * 60 * 24));
    if (daysLate <= 0) continue; // oldest unpaid installment isn't due yet

    const profile = await base44.entities.MemberProfile.get(membership.member_profile_id);
    if (!profile?.mobile) continue;

    const outstandingAmount = unpaidInstallments.reduce((s, i) => s + i.amount, 0);
    const amountStr = `${currency} ${outstandingAmount}`;
    const daysLateStr = daysLate.toString();
    const breakdown = unpaidInstallments
      .map((i) => `Month ${i.number} overdue = ${currency} ${i.amount}`)
      .join("\n");
    const template = daysLate <= 7 ? "payment_reminder_overdue_v5" : "payment_reminder_urgent_v5";
    const payLink = `${window.location.origin}/payments`;

    // late_interest_percent is the plan's own configured monthly rate (e.g.
    // 2%) — prorated by how many days late against the actual outstanding
    // amount, same as a simple monthly interest calculation. A plan with no
    // rate configured (0, e.g. live_auction/lakhbox) correctly charges no
    // late fee rather than a fabricated one.
    const lateFee = Math.round(outstandingAmount * ((plan?.late_interest_percent || 0) / 100) * (daysLate / 30));

    const parameters = template === "payment_reminder_urgent_v5"
      ? [profile.full_name, daysLateStr, breakdown, `${currency} ${lateFee}`, amountStr, payLink]
      : [profile.full_name, daysLateStr, breakdown, amountStr, payLink];

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
      await sendWhatsAppMessage({ phone: t.mobile, templateName: t.template, parameters: t.parameters, memberProfileId: t.memberProfileId, purpose: "payment_reminder" });
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

// `manualDateTime` (a datetime-local string, e.g. "2026-09-07T10:30") lets
// the admin announce a specific month's auction ahead of actually opening
// it — auction day moves around month to month (no fixed schedule), and no
// Auction row exists yet at announcement time to read a real date from, so
// this is the only source of truth for "when" in that case. Omit it to fall
// back to the original behavior: read the time from whatever auction is
// currently open.
export const computeAuctionReminderTargets = async (groupId, manualDateTime) => {
  const group = await base44.entities.ChitGroup.get(groupId);
  if (!group) throw new Error("Group not found");

  const plan = await base44.entities.ChitPlan.get(group.plan_id);
  if (!plan || plan.model !== "live_auction") throw new Error("Not a live auction group");

  const memberships = await base44.entities.GroupMembership.filter({
    group_id: groupId,
    status: "active",
  });
  if (memberships.length === 0) return { targets: [], auctionDateStr: null };

  let auctionDate;
  if (manualDateTime) {
    auctionDate = new Date(manualDateTime);
    if (Number.isNaN(auctionDate.getTime())) throw new Error("Invalid auction date/time");
  } else {
    // Get the group's current (not-yet-closed) auction. "pending" was never
    // a real status — the auctions table only allows scheduled/open/call_1/
    // call_2/final_call/closed/cancelled, so filtering on status: "pending"
    // could never match a row and this silently sent 0 reminders forever.
    const groupAuctions = await base44.entities.Auction.filter({ group_id: groupId }, "-month_number", 5);
    const upcomingAuction = groupAuctions.find((a) => a.status !== "closed" && a.status !== "cancelled");
    if (!upcomingAuction) return { targets: [], auctionDateStr: null };
    auctionDate = new Date(upcomingAuction.created_at);
  }

  const memberProfiles = await Promise.all(
    memberships.map((m) => base44.entities.MemberProfile.get(m.member_profile_id))
  );

  const auctionDateStr = auctionDate.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  const targets = memberProfiles
    .filter((p) => p?.mobile)
    .map((p) => ({
      memberProfileId: p.id,
      fullName: p.full_name || "Member",
      mobile: p.mobile,
      // v4 (and every earlier version) said "starts soon" — fine for the
      // original 2-hours-ahead use case, misleading once this got reused as
      // a flexible "announce whenever" reminder that can go out days in
      // advance. v5 has the same {{1..4}} params with neutral wording.
      template: "auction_reminder_v5",
      parameters: [p.full_name, auctionDateStr, group.group_name || group.group_code, `${window.location.origin}/live-auction`],
    }));

  return { targets, auctionDateStr };
};

// The auction is actually live right now — distinct from
// computeAuctionReminderTargets above, which is worded for an announcement
// sent some time (typically ~2 hours) ahead of the auction actually
// opening. Same admin-triggered, manual-send model — no scheduled job.
export const computeAuctionStartingNowTargets = async (groupId) => {
  const group = await base44.entities.ChitGroup.get(groupId);
  if (!group) throw new Error("Group not found");

  const plan = await base44.entities.ChitPlan.get(group.plan_id);
  if (!plan || plan.model !== "live_auction") throw new Error("Not a live auction group");

  const memberships = await base44.entities.GroupMembership.filter({
    group_id: groupId,
    status: "active",
  });
  if (memberships.length === 0) return [];

  const memberProfiles = await Promise.all(
    memberships.map((m) => base44.entities.MemberProfile.get(m.member_profile_id))
  );

  return memberProfiles
    .filter((p) => p?.mobile)
    .map((p) => ({
      memberProfileId: p.id,
      fullName: p.full_name || "Member",
      mobile: p.mobile,
      template: "auction_starting_now_v1",
      parameters: [p.full_name, group.group_name || group.group_code, `${window.location.origin}/live-auction`],
    }));
};

export const sendAuctionStartingNowReminders = async (groupId, targets) => {
  let sent = 0;
  let failed = 0;

  for (const t of targets) {
    try {
      await sendWhatsAppMessage({ phone: t.mobile, templateName: t.template, parameters: t.parameters, memberProfileId: t.memberProfileId, purpose: "auction_starting_now" });
      sent++;
    } catch (err) {
      failed++;
      console.error(`Failed to send auction-starting-now reminder to ${t.fullName}:`, err);
    }
  }

  logAudit({
    module: "Reminders",
    action: "send-auction-starting-now",
    record_id: groupId,
    details: `Sent ${sent} auction-starting-now reminders${failed ? ` (${failed} failed)` : ""} — ${targets.map((t) => t.fullName).join(", ")}`,
  });

  return { sent, failed };
};

// Advance "save the date" announcement for a trial (practice, zero money)
// auction that precedes the real one — distinct from
// computeAuctionReminderTargets above (which announces a single auction
// that's about to start). Both the trial and real auction's date/time are
// admin-picked, since neither necessarily has an Auction row yet at
// announcement time.
export const computeAuctionSaveTheDateTargets = async (groupId, { trialDateTime, realDateTime }) => {
  const group = await base44.entities.ChitGroup.get(groupId);
  if (!group) throw new Error("Group not found");

  const plan = await base44.entities.ChitPlan.get(group.plan_id);
  if (!plan || plan.model !== "live_auction") throw new Error("Not a live auction group");

  const memberships = await base44.entities.GroupMembership.filter({
    group_id: groupId,
    status: "active",
  });
  if (memberships.length === 0) return [];

  const trialDate = new Date(trialDateTime);
  const realDate = new Date(realDateTime);
  if (Number.isNaN(trialDate.getTime()) || Number.isNaN(realDate.getTime())) {
    throw new Error("Pick both the trial and real auction date/time first");
  }
  const fmt = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const trialDateStr = fmt(trialDate);
  const realDateStr = fmt(realDate);

  const memberProfiles = await Promise.all(
    memberships.map((m) => base44.entities.MemberProfile.get(m.member_profile_id))
  );

  return memberProfiles
    .filter((p) => p?.mobile)
    .map((p) => ({
      memberProfileId: p.id,
      fullName: p.full_name || "Member",
      mobile: p.mobile,
      // v1 has a "Join Live Auction" URL button — WhatsApp prefetches a
      // link-preview card for that button's target and renders it above the
      // message, and since /live-auction is just a client-side route with no
      // page-specific metadata, that card falls back to the whole site's
      // generic title/description. Reads as a random ad card before the
      // actual "Hi {{name}}" greeting. v2 drops the button entirely (no
      // in-app deep link, but no stray card either) — same {{1..4}} meaning
      // and order in both, so only the template name changes here.
      template: "auction_save_the_date_v2",
      // Single-quoted in the parameter value itself, not the template body —
      // the approved body text can't be edited without a new Meta review,
      // but whatever string is substituted into {{3}} is ours to format.
      parameters: [p.full_name, trialDateStr, `'${group.group_name || group.group_code}'`, realDateStr],
    }));
};

export const sendAuctionSaveTheDateReminders = async (groupId, targets) => {
  let sent = 0;
  let failed = 0;

  for (const t of targets) {
    try {
      await sendWhatsAppMessage({ phone: t.mobile, templateName: t.template, parameters: t.parameters, memberProfileId: t.memberProfileId, purpose: "auction_save_the_date" });
      sent++;
    } catch (err) {
      console.error(`Failed to send save-the-date reminder to ${t.fullName}:`, err);
      failed++;
    }
  }

  logAudit({
    module: "Reminders",
    action: "send-auction-savedate",
    record_id: groupId,
    details: `Sent ${sent} trial-auction save-the-date${sent === 1 ? "" : "s"}${failed ? ` (${failed} failed)` : ""} — ${targets.map((t) => t.fullName).join(", ") || "none"}`,
  });

  return { sent, failed };
};

export const sendAuctionReminders = async (groupId, targets) => {
  const list = targets || (await computeAuctionReminderTargets(groupId)).targets;
  let sent = 0;
  let failed = 0;

  for (const t of list) {
    try {
      await sendWhatsAppMessage({ phone: t.mobile, templateName: t.template, parameters: t.parameters, memberProfileId: t.memberProfileId, purpose: "auction_reminder_2h" });
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

// The "coming up" nudge — distinct from computePaymentReminderTargets, which
// only ever fires AFTER the due date has already passed. `daysBefore` used
// to require an EXACT match (today must be precisely N days before due, or
// this silently returns nobody) — a fine assumption for an automated daily
// cron checking "is it exactly day N," but this is an admin manually
// clicking a button, not a scheduled job, and there isn't one. That made it
// impossible to announce the due date whenever the admin actually wanted to
// (had to correctly pre-calculate today's exact distance from the due date
// first). Now: daysBefore=0 ("due today") still means exactly today, since
// that's inherently date-specific wording, but any other call just needs
// the due date to still be in the future — works any day before it, not one
// specific day.
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
  const auctions = await auctionsFor(plan, groupId);

  const currency = plan?.currency || "INR";
  // current_month is 1-indexed ("Month 1" is due in the start month itself),
  // same convention as auctionEngine.js/paymentPreview.js.
  const dueDate = new Date(collectionDateUTC(group.start_date, group.current_month - 1, group.monthly_collection_date));
  const today = todayUTC(currency);
  // Both sides are UTC-midnight now, so this is always a clean whole number
  // of days — no fractional-day drift from comparing against the real
  // current instant, which previously made this silently miss its target
  // day (and so send nothing) depending on what time it was when it ran.
  const daysUntilDue = Math.round((dueDate - today) / (1000 * 60 * 60 * 24));
  if (daysBefore === 0 ? daysUntilDue !== 0 : daysUntilDue <= 0) return [];

  // An India group's due date is always shown in IST -- explicit
  // Asia/Kolkata, not the viewer's own browser timezone (which, left
  // unset, silently shows the day before for anyone west of UTC; see
  // dates.js's header comment for the same class of bug). CAD groups have
  // no equivalent "home" zone in this app, so they stay pinned to UTC —
  // still correct (no local-timezone drift), just not IST-specific.
  const dueDateStr = dueDate.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: currency === "CAD" ? "UTC" : "Asia/Kolkata",
  });
  const targets = [];

  for (const membership of memberships) {
    const alreadyPaid = allPayments.some(
      (p) => p.member_profile_id === membership.member_profile_id && p.installment_number === group.current_month
    );
    if (alreadyPaid) continue;

    const profile = await base44.entities.MemberProfile.get(membership.member_profile_id);
    if (!profile?.mobile) continue;

    // Priced correctly for this specific installment (dividend-adjusted for
    // live_auction, etc.) instead of the flat monthly_contribution — same
    // bug, and same fix, as computePaymentReminderTargets above. Falls back
    // to the flat rate only if current_month somehow isn't in this
    // member's own unpaid list (shouldn't happen given the alreadyPaid
    // check above, but never crash a reminder send over it).
    const preview = getNextPaymentPreview({ membership, plan, group, auctions });
    const currentInstallment = preview.unpaidInstallments.find((i) => i.number === group.current_month);
    const amount = currentInstallment ? currentInstallment.amount : (plan?.monthly_contribution || 0);
    const amountStr = `${currency} ${amount}`;
    const payLink = `${window.location.origin}/payments`;
    // daysBefore=0 (due today) gets its own template with "is due today!"
    // urgency instead of "upcoming... please pay before the due date",
    // which reads wrong for something due on the day itself. Separately,
    // India's templates name UPI/Bank Transfer explicitly — wrong for
    // Canada, which only has Interac e-Transfer/Cash — so Canada gets its
    // own _ca_v2 templates with a payment-method-neutral swap instead.
    const isCanada = currency === "CAD";
    const template = daysBefore === 0
      ? (isCanada ? "payment_due_today_ca_v2" : "payment_due_today_v2")
      : (isCanada ? "payment_upcoming_reminder_ca_v2" : "payment_upcoming_reminder_v4");
    targets.push({
      memberProfileId: profile.id,
      fullName: profile.full_name || "Member",
      mobile: profile.mobile,
      dueDateStr,
      amountStr,
      template,
      parameters: [profile.full_name, String(group.current_month), amountStr, dueDateStr, payLink],
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
      await sendWhatsAppMessage({ phone: t.mobile, templateName: t.template, parameters: t.parameters, memberProfileId: t.memberProfileId, purpose: `upcoming_due_${daysBefore}d` });
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
