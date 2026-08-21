import { base44 } from "@/api/base44Client";

/**
 * Auto-generates a member code: CB-M0001, CB-M0002, etc. Derived from the
 * highest existing code number, not a row count — a count drifts out of
 * sync (and starts colliding with still-in-use codes) the moment any
 * profile is deleted, since numbering isn't necessarily dense.
 */
export async function generateMemberCode() {
  const existing = await base44.entities.MemberProfile.list("-created_date", 1000);
  const maxNum = existing.reduce((max, m) => {
    const match = /^CB-M(\d+)$/.exec(m.member_code || "");
    return match ? Math.max(max, parseInt(match[1], 10)) : max;
  }, 0);
  return `CB-M${String(maxNum + 1).padStart(4, "0")}`;
}

/**
 * Auto-generates a group code based on currency:
 * CB_CA_YYYY_XX (Canada) or CB_IN_YYYY_XX (India)
 * where XX is a 2-digit sequence for that year+region.
 */
export async function generateGroupCode(currency = "INR") {
  const year = new Date().getFullYear();
  const region = currency === "CAD" ? "CA" : "IN";
  const prefix = `CB_${region}_${year}_`;

  const existing = await base44.entities.ChitGroup.list("-created_date", 500);
  const maxNum = existing.reduce((max, g) => {
    if (!g.group_code || !g.group_code.startsWith(prefix)) return max;
    const n = parseInt(g.group_code.slice(prefix.length), 10);
    return Number.isNaN(n) ? max : Math.max(max, n);
  }, 0);
  return `${prefix}${String(maxNum + 1).padStart(2, "0")}`;
}

/**
 * Auto-generates a group name from the plan name + region.
 * e.g. "Canada 5K Plan — Toronto 2025"
 */
export function generateGroupName(planName, branch = "", currency = "INR") {
  const region = currency === "CAD" ? "Canada" : "India";
  const year = new Date().getFullYear();
  const parts = [planName, region];
  if (branch) parts.push(branch);
  parts.push(String(year));
  return parts.join(" — ");
}