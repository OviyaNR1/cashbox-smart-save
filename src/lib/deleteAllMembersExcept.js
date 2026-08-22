import { base44 } from "@/api/base44Client";

/**
 * DANGEROUS: Deletes all members except the one with the given phone number
 * This is a destructive operation that cannot be undone
 */
export const deleteAllMembersExcept = async (phoneToKeep) => {
  try {
    console.warn("⚠️ DESTRUCTIVE OPERATION: Deleting all members except", phoneToKeep);

    // Get all members
    const allMembers = await base44.entities.MemberProfile.list("-created_date", 5000);

    // Find the member to keep
    const memberToKeep = allMembers.find((m) => m.mobile === phoneToKeep);
    if (!memberToKeep) {
      throw new Error(`Member with phone ${phoneToKeep} not found`);
    }

    console.log("Keeping member:", memberToKeep.full_name, memberToKeep.mobile);

    // Get all members to delete
    const membersToDelete = allMembers.filter((m) => m.mobile !== phoneToKeep);
    console.log(`Deleting ${membersToDelete.length} members...`);

    let deletedCount = 0;
    let errorCount = 0;

    // Delete all related data for each member to delete
    for (const member of membersToDelete) {
      try {
        // Delete group memberships
        const memberships = await base44.entities.GroupMembership.filter({
          member_profile_id: member.id,
        });
        for (const m of memberships) {
          await base44.entities.GroupMembership.delete(m.id);
        }

        // Delete payments
        const payments = await base44.entities.Payment.filter({
          member_profile_id: member.id,
        });
        for (const p of payments) {
          await base44.entities.Payment.delete(p.id);
        }

        // Delete dividends
        const dividends = await base44.entities.Dividend.filter({
          member_profile_id: member.id,
        });
        for (const d of dividends) {
          await base44.entities.Dividend.delete(d.id);
        }

        // Delete winners
        const winners = await base44.entities.Winner.filter({
          member_profile_id: member.id,
        });
        for (const w of winners) {
          await base44.entities.Winner.delete(w.id);
        }

        // Delete auction bids
        const bids = await base44.entities.AuctionBid.filter({
          member_profile_id: member.id,
        });
        for (const b of bids) {
          await base44.entities.AuctionBid.delete(b.id);
        }

        // Delete plan requests
        const planRequests = await base44.entities.PlanRequest.filter({
          member_profile_id: member.id,
        });
        for (const pr of planRequests) {
          await base44.entities.PlanRequest.delete(pr.id);
        }

        // Finally, delete the member profile
        await base44.entities.MemberProfile.delete(member.id);
        deletedCount++;
        console.log(`✓ Deleted ${member.full_name} (${member.mobile})`);
      } catch (error) {
        errorCount++;
        console.error(`✗ Error deleting ${member.full_name}:`, error.message);
      }
    }

    return {
      success: true,
      kept: memberToKeep.full_name,
      deletedCount,
      errorCount,
      message: `Deleted ${deletedCount} members. Kept ${memberToKeep.full_name}. Errors: ${errorCount}`,
    };
  } catch (error) {
    throw new Error(`Delete failed: ${error.message}`);
  }
};
