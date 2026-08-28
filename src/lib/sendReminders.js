import { base44 } from "@/api/base44Client";
import { addMonthsUTC, collectionDateUTC } from "./dates";
import { sendWhatsAppMessage } from "./sendWhatsAppMessage";

export const sendPaymentReminders = async (groupId) => {
  try {
    // Get group and current month
    const group = await base44.entities.ChitGroup.get(groupId);
    if (!group) throw new Error("Group not found");

    // Get all active members
    const memberships = await base44.entities.GroupMembership.filter({
      group_id: groupId,
      status: "active",
    });

    // Get payments for current month
    const paidMembers = await base44.entities.Payment.filter({
      group_id: groupId,
      installment_number: group.current_month,
      status: "success",
    });
    const paidMemberIds = new Set(paidMembers.map((p) => p.member_profile_id));

    // Find unpaid members
    const unpaidMemberships = memberships.filter(
      (m) => !paidMemberIds.has(m.member_profile_id)
    );

    if (unpaidMemberships.length === 0) {
      return { sent: 0, failed: 0, message: "All members have paid" };
    }

    // Get member profiles
    const memberProfiles = await Promise.all(
      unpaidMemberships.map((m) =>
        base44.entities.MemberProfile.get(m.member_profile_id)
      )
    );

    // Calculate collection date and days late
    const today = new Date();
    const collDate = new Date(collectionDateUTC(group.start_date, group.current_month));
    const daysLate = Math.floor((today - collDate) / (1000 * 60 * 60 * 24));

    // Determine template based on days late
    let template, templateParams;
    if (daysLate <= 0) {
      return { sent: 0, failed: 0, message: "Payment not yet due" };
    } else if (daysLate <= 7) {
      template = "payment_reminder_overdue";
    } else {
      template = "payment_reminder_urgent";
    }

    // Send reminders to unpaid members
    let sent = 0;
    let failed = 0;

    for (const profile of memberProfiles) {
      if (!profile?.mobile) continue;

      try {
        const daysLateStr = daysLate.toString();
        const amountStr = `${group.currency || "INR"} ${group.contribution_amount || "0"}`;
        const lateFeeStr = `${group.currency || "INR"} ${Math.floor(daysLate * 10)}`; // Example: 10 per day

        templateParams = [profile.full_name, daysLateStr, amountStr, lateFeeStr];

        await sendWhatsAppMessage({
          phone: profile.mobile,
          templateName: template,
          parameters: templateParams,
        });
        sent++;
      } catch (err) {
        console.error(`Failed to send reminder to ${profile.full_name}:`, err);
        failed++;
      }
    }

    return { sent, failed, template, daysLate };
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

    // Get upcoming auctions
    const auctions = await base44.entities.Auction.filter({
      group_id: groupId,
      status: "pending",
    });

    if (auctions.length === 0) {
      return { sent: 0, failed: 0, message: "No upcoming auctions" };
    }

    const upcomingAuction = auctions[0];

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
          group.group_code,
        ];

        await sendWhatsAppMessage({
          phone: profile.mobile,
          templateName: "auction_reminder",
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
