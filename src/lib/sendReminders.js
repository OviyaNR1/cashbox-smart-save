import { base44 } from "@/api/base44Client";
import { collectionDateUTC } from "./dates";
import { sendWhatsAppMessage } from "./sendWhatsAppMessage";

export const sendPaymentReminders = async (groupId) => {
  try {
    // Get group and current month
    const group = await base44.entities.ChitGroup.get(groupId);
    if (!group) throw new Error("Group not found");

    // Monthly amount and currency live on the plan, not the group
    const plan = await base44.entities.ChitPlan.get(group.plan_id);

    // Get all active members
    const memberships = await base44.entities.GroupMembership.filter({
      group_id: groupId,
      status: "active",
    });

    if (memberships.length === 0) {
      return { sent: 0, failed: 0, message: "No active members" };
    }

    // Get every successful payment ever made in this group, so we can tell
    // which installments (not just the current one) each member has settled.
    const allPayments = await base44.entities.Payment.filter({
      group_id: groupId,
      status: "success",
    });

    const currency = plan?.currency || "INR";
    const monthlyAmount = plan?.monthly_contribution || 0;
    const today = new Date();

    let sent = 0;
    let failed = 0;

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
      const collDate = new Date(collectionDateUTC(group.start_date, oldestUnpaid, group.monthly_collection_date));
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
      const template = daysLate <= 7 ? "payment_reminder_overdue_v3" : "payment_reminder_urgent_v3";

      try {
        const parameters = template === "payment_reminder_urgent_v3"
          ? [profile.full_name, daysLateStr, breakdown, `${currency} ${Math.floor(daysLate * 10)}`, amountStr]
          : [profile.full_name, daysLateStr, breakdown, amountStr];

        await sendWhatsAppMessage({
          phone: profile.mobile,
          templateName: template,
          parameters,
        });
        sent++;
      } catch (err) {
        console.error(`Failed to send reminder to ${profile.full_name}:`, err);
        failed++;
      }
    }

    return { sent, failed };
  } catch (error) {
    throw new Error(`Payment reminder error: ${error.message}`);
  }
};

export const sendAuctionReminders = async (groupId) => {
  try {
    // Get group
    const group = await base44.entities.ChitGroup.get(groupId);
    if (!group) throw new Error("Group not found");

    // Get plan
    const plan = await base44.entities.ChitPlan.get(group.plan_id);
    if (!plan || plan.model !== "live_auction")
      throw new Error("Not a live auction group");

    // Get all active members
    const memberships = await base44.entities.GroupMembership.filter({
      group_id: groupId,
      status: "active",
    });

    if (memberships.length === 0) {
      return { sent: 0, failed: 0, message: "No active members" };
    }

    // Get the group's current (not-yet-closed) auction. "pending" was never
    // a real status — the auctions table only allows scheduled/open/call_1/
    // call_2/final_call/closed/cancelled, so filtering on status: "pending"
    // could never match a row and this silently sent 0 reminders forever.
    const groupAuctions = await base44.entities.Auction.filter(
      { group_id: groupId },
      "-month_number",
      5
    );
    const upcomingAuction = groupAuctions.find(
      (a) => a.status !== "closed" && a.status !== "cancelled"
    );

    if (!upcomingAuction) {
      return { sent: 0, failed: 0, message: "No upcoming auctions" };
    }

    // Get member profiles
    const memberProfiles = await Promise.all(
      memberships.map((m) =>
        base44.entities.MemberProfile.get(m.member_profile_id)
      )
    );

    // Format auction date
    const auctionDate = new Date(upcomingAuction.created_at);
    const auctionDateStr = auctionDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    // Send reminders to all members
    let sent = 0;
    let failed = 0;

    for (const profile of memberProfiles) {
      if (!profile?.mobile) continue;

      try {
        const templateParams = [
          profile.full_name,
          auctionDateStr,
          group.group_name || group.group_code,
          `${window.location.origin}/live-auction`,
        ];

        await sendWhatsAppMessage({
          phone: profile.mobile,
          templateName: "auction_reminder_v3",
          parameters: templateParams,
        });
        sent++;
      } catch (err) {
        console.error(`Failed to send auction reminder to ${profile.full_name}:`, err);
        failed++;
      }
    }

    return { sent, failed, auctionDate: auctionDateStr };
  } catch (error) {
    throw new Error(`Auction reminder error: ${error.message}`);
  }
};
